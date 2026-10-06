const admin = require("firebase-admin");
const { logAuditEvent } = require("./audit");

/**
 * Computes official server-side earnings split from validated ride income figures
 * and 50% Owner / 50% Driver shared fuel model (Petrol & CNG).
 */
function calculateEarningsSplit(grossIncome, platformCharges = 0, fuelExpenseAmount = 0, fuelPaymentSource = "OWNER_DIRECT") {
  const gross = Math.max(0, Number(grossIncome) || 0);
  const charges = Math.max(0, Number(platformCharges) || 0);
  const netIncome = Math.max(0, gross - charges);

  // 50% Worker Share, 50% Owner Share
  const workerShare = Math.round((netIncome * 0.5) * 100) / 100;
  const ownerShare = Math.round((netIncome * 0.5) * 100) / 100;

  // 10% temporary reserve hold on worker share
  const reserveHold = Math.round((workerShare * 0.10) * 100) / 100;

  // 50% Owner and 50% Driver Fuel Model (Petrol & CNG)
  const fuelTotal = Math.max(0, Number(fuelExpenseAmount) || 0);
  const ownerFuelShare = Math.round((fuelTotal * 0.5) * 100) / 100;
  const driverFuelShare = Math.round((fuelTotal * 0.5) * 100) / 100;

  // Fuel Adjustment on Worker Daily Payout:
  // If OWNER_DIRECT (Owner paid 100% directly at bunk): Driver's 50% fuel share is deducted from driver payout.
  // If REIMBURSED_TO_DRIVER (Driver paid 100% out of pocket): Owner reimburses driver for Owner's 50% fuel share.
  const driverFuelDeduction = fuelPaymentSource === "OWNER_DIRECT" ? driverFuelShare : 0;
  const driverFuelReimbursement = fuelPaymentSource === "REIMBURSED_TO_DRIVER" ? ownerFuelShare : 0;

  const payableToday = Math.max(
    0,
    Math.round((workerShare - reserveHold - driverFuelDeduction + driverFuelReimbursement) * 100) / 100
  );

  const ownerNetIncome = Math.round((ownerShare - ownerFuelShare) * 100) / 100;

  return {
    grossIncome: gross,
    platformCharges: charges,
    netIncome,
    workerShare,
    ownerShare,
    reserveHold,
    fuelTotal,
    ownerFuelShare,
    driverFuelShare,
    fuelPaymentSource,
    driverFuelDeduction,
    driverFuelReimbursement,
    ownerNetIncome,
    payableToday
  };
}

/**
 * Creates an official settlement record in Firestore from Owner's manually verified daily totals.
 * BUSINESS MODEL:
 * - Rides: 50% Driver, 50% Owner Split after platform charges.
 * - Fuel (Petrol & CNG): 50% Owner and 50% Driver shared model.
 * - Cash rides remain included in verified Gross Income.
 */
async function createSettlementRecord({
  driverId,
  dutySessionId = null,
  date,
  grossIncome,
  platformCharges = 0,
  cashRidesCollected = 0,
  fuelExpenseAmount = 0,
  fuelPaymentSource = "OWNER_DIRECT", // OWNER_DIRECT or REIMBURSED_TO_DRIVER
  adminId,
  verificationMethod = "PHYSICAL_PHONE_INSPECTION",
  notes = "",
  submissionId = null
}) {
  const db = admin.firestore();
  const split = calculateEarningsSplit(grossIncome, platformCharges, fuelExpenseAmount, fuelPaymentSource);

  const settlementId = `SETTLE_${Date.now()}_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  const settlementRef = db.collection("settlements").doc(settlementId);

  const settlementData = {
    settlementId,
    driverId,
    dutySessionId,
    submissionId,
    date: date || new Date().toISOString().split("T")[0],
    ...split,
    cashRidesCollected: Number(cashRidesCollected) || 0,
    fuelExpenseAmount: Number(fuelExpenseAmount) || 0,
    fuelPaymentSource,
    verificationMethod, // PHYSICAL_PHONE_INSPECTION or SUPPORTING_SCREENSHOT
    status: "PENDING_PAYOUT", // PENDING_PAYOUT, PAID, ADJUSTED
    paidAmount: 0,
    pendingReserve: split.reserveHold,
    paymentReference: null,
    paymentMethod: null,
    paidAt: null,
    approvedBy: adminId,
    approvedAt: new Date().toISOString(),
    notes,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await settlementRef.set(settlementData);

  // If fuel expense was incurred, record it in fuelExpenses ledger with 50/50 breakdown
  let fuelExpenseId = null;
  if (Number(fuelExpenseAmount) > 0) {
    fuelExpenseId = await recordOwnerFuelExpense({
      driverId,
      settlementId,
      amount: Number(fuelExpenseAmount),
      date: settlementData.date,
      paymentSource: fuelPaymentSource,
      notes: `Depot settlement fuel: ₹${split.fuelTotal} (50% Owner: ₹${split.ownerFuelShare}, 50% Driver: ₹${split.driverFuelShare}). ${notes || ''}`,
      adminId
    });
  }

  // Also create corresponding daily earnings entry for driver dashboard
  const earningsRef = db.collection("earnings").doc(`EARN_${settlementId}`);
  await earningsRef.set({
    earningId: `EARN_${settlementId}`,
    settlementId,
    driverId,
    date: settlementData.date,
    grossIncome: split.grossIncome,
    platformCharges: split.platformCharges,
    netIncome: split.netIncome,
    workerShare: split.workerShare,
    ownerShare: split.ownerShare,
    reserveHold: split.reserveHold,
    fuelTotal: split.fuelTotal,
    ownerFuelShare: split.ownerFuelShare,
    driverFuelShare: split.driverFuelShare,
    driverFuelDeduction: split.driverFuelDeduction,
    driverFuelReimbursement: split.driverFuelReimbursement,
    ownerNetIncome: split.ownerNetIncome,
    payableToday: split.payableToday,
    verificationMethod,
    fuelExpenseSeparatelyRecorded: Number(fuelExpenseAmount) || 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  // Log audit trail
  await logAuditEvent({
    driverId,
    action: "SETTLEMENT_CREATED",
    relevantRecordId: settlementId,
    newValue: JSON.stringify({ ...split, verificationMethod }),
    actor: adminId,
    source: "ADMIN_WEB",
    notes: `Owner physically verified phone platforms. Net: ₹${split.netIncome}, Worker 50%: ₹${split.workerShare}. 50/50 Fuel: ₹${split.fuelTotal} (Owner: ₹${split.ownerFuelShare}, Driver: ₹${split.driverFuelShare}, Net Driver Payable: ₹${split.payableToday}).`
  });

  return { ...settlementData, fuelExpenseId };
}

/**
 * Records an owner fuel expense separately from driver ride earnings.
 */
async function recordOwnerFuelExpense({
  driverId,
  bikeId = null,
  settlementId = null,
  amount,
  date,
  paymentSource = "OWNER_DIRECT", // OWNER_DIRECT, REIMBURSED_TO_DRIVER
  odometer = null,
  notes = "",
  adminId
}) {
  const db = admin.firestore();
  const fuelRef = db.collection("fuelExpenses").doc();
  const fuelData = {
    id: fuelRef.id,
    driverId,
    bikeId,
    settlementId,
    amount: Number(amount),
    date: date || new Date().toISOString().split("T")[0],
    paymentSource,
    odometer: odometer ? Number(odometer) : null,
    notes,
    recordedBy: adminId,
    recordedAt: new Date().toISOString(),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };

  await fuelRef.set(fuelData);

  await logAuditEvent({
    driverId,
    action: "OWNER_FUEL_EXPENSE_RECORDED",
    relevantRecordId: fuelRef.id,
    newValue: JSON.stringify(fuelData),
    actor: adminId,
    source: "ADMIN_WEB",
    notes: `Owner fuel expense ₹${amount} recorded separately (${paymentSource}). Zero deduction on driver share.`
  });

  return fuelRef.id;
}

/**
 * Records a financial adjustment with mandatory audit record.
 */
async function recordAdjustment({
  settlementId,
  driverId,
  amount,
  type, // CREDIT or DEBIT
  reason,
  adminId
}) {
  if (!reason || reason.trim().length < 5) {
    throw new Error("A clear reason (at least 5 characters) is mandatory for financial adjustments.");
  }

  const db = admin.firestore();
  const adjRef = db.collection("settlementAdjustments").doc();

  const adjustmentData = {
    adjustmentId: adjRef.id,
    settlementId,
    driverId,
    amount: Number(amount),
    type,
    reason,
    adminId,
    timestamp: new Date().toISOString(),
    serverTimestamp: admin.firestore.FieldValue.serverTimestamp()
  };

  await adjRef.set(adjustmentData);

  // Update settlement adjustment tally
  const settlementRef = db.collection("settlements").doc(settlementId);
  const snap = await settlementRef.get();
  if (snap.exists) {
    const existing = snap.data();
    const currentAdjustments = existing.totalAdjustments || 0;
    const delta = type === "CREDIT" ? Number(amount) : -Number(amount);
    await settlementRef.update({
      totalAdjustments: currentAdjustments + delta,
      status: "ADJUSTED"
    });
  }

  await logAuditEvent({
    driverId,
    action: "SETTLEMENT_ADJUSTMENT",
    relevantRecordId: adjRef.id,
    newValue: JSON.stringify(adjustmentData),
    actor: adminId,
    source: "ADMIN_WEB",
    notes: `Adjustment of ${type} ₹${amount} applied. Reason: ${reason}`
  });

  return adjustmentData;
}

module.exports = {
  calculateEarningsSplit,
  createSettlementRecord,
  recordAdjustment,
  recordOwnerFuelExpense
};
