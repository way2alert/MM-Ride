export const DRIVER_STATES = {
  REGISTERED: 'Registered',
  DOCUMENTS_SUBMITTED: 'Documents Submitted',
  DOCUMENT_VERIFICATION_PENDING: 'Document Verification Pending',
  ADDRESS_VERIFICATION_PENDING: 'Address Verification Pending',
  APPROVED: 'Approved',
  APPROVED_BIKE_NOT_ASSIGNED: 'Approved – Bike Not Assigned',
  BIKE_ASSIGNED: 'Bike Assigned',
  BIKE_HANDOVER_PENDING: 'Bike Handover Pending',
  ACTIVE_DRIVER: 'Active Driver',
  SUSPENDED: 'Suspended',
  REJECTED: 'Rejected',
  ACCOUNT_CLOSED: 'Account Closed'
};

export const BIKE_STATUSES = {
  AVAILABLE: 'Available',
  RESERVED: 'Reserved',
  ASSIGNED: 'Assigned',
  HANDOVER_PENDING: 'Handover Pending',
  ACTIVE: 'Active on Duty',
  MAINTENANCE: 'Maintenance',
  ACCIDENT: 'Accident Report',
  SUSPENDED: 'Suspended',
  RETURNED: 'Returned'
};

export const ADMIN_ROLES = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  OPERATIONS: 'Operations',
  FINANCE: 'Finance',
  VIEW_ONLY: 'View Only'
};

/**
 * Returns the effective lifecycle status, human-readable label, and badge CSS class.
 * Intelligently handles both modern lifecycle states and legacy / fallback field structures.
 */
export const getDriverEffectiveStatus = (driver) => {
  if (!driver) return { key: 'REGISTERED', label: 'Registered', badgeClass: 'badge-neutral' };

  if (driver.isSuspended || driver.status === 'SUSPENDED' || driver.accountStatus === 'SUSPENDED') {
    return { key: 'SUSPENDED', label: 'Suspended', badgeClass: 'badge-danger' };
  }
  if (driver.accountStatus === 'REJECTED' || driver.approvalStatus === 'REJECTED' || driver.status === 'REJECTED') {
    return { key: 'REJECTED', label: 'Rejected', badgeClass: 'badge-danger' };
  }
  if (driver.accountStatus === 'ACCOUNT_CLOSED' || driver.status === 'CLOSED') {
    return { key: 'ACCOUNT_CLOSED', label: 'Account Closed', badgeClass: 'badge-neutral' };
  }

  const hasBike = Boolean(driver.assignedBikeId || driver.assignedBikeRegistration);
  const isApproved = driver.approvalStatus === 'APPROVED' || 
                     driver.accountStatus === 'APPROVED' || 
                     driver.accountStatus === 'APPROVED_BIKE_NOT_ASSIGNED' || 
                     driver.accountStatus === 'BIKE_ASSIGNED' || 
                     driver.accountStatus === 'BIKE_HANDOVER_PENDING' || 
                     driver.accountStatus === 'ACTIVE_DRIVER';

  if (driver.accountStatus === 'ACTIVE_DRIVER' || (hasBike && (driver.handoverCompletedAt || driver.isCurrentlyOnDuty || driver.status === 'ACTIVE'))) {
    return { key: 'ACTIVE_DRIVER', label: 'Active Driver', badgeClass: 'badge-success' };
  }
  if (driver.accountStatus === 'BIKE_HANDOVER_PENDING' || (hasBike && !driver.handoverCompletedAt)) {
    return { key: 'BIKE_HANDOVER_PENDING', label: 'Bike Handover Pending', badgeClass: 'badge-warning' };
  }
  if (driver.accountStatus === 'BIKE_ASSIGNED' || hasBike) {
    return { key: 'BIKE_ASSIGNED', label: 'Bike Assigned', badgeClass: 'badge-info' };
  }
  if (isApproved || driver.accountStatus === 'APPROVED_BIKE_NOT_ASSIGNED' || driver.accountStatus === 'APPROVED') {
    return { key: 'APPROVED_BIKE_NOT_ASSIGNED', label: 'Approved – Bike Not Assigned', badgeClass: 'badge-info' };
  }
  if (driver.accountStatus === 'ADDRESS_VERIFICATION_PENDING' || (driver.verificationStatus === 'DOCUMENTS_VERIFIED' && !driver.addressVerified)) {
    return { key: 'ADDRESS_VERIFICATION_PENDING', label: 'Address Verification Pending', badgeClass: 'badge-warning' };
  }
  if (driver.accountStatus === 'DOCUMENT_VERIFICATION_PENDING' || (driver.verificationStatus === 'PENDING' && driver.verificationSubmittedAt)) {
    return { key: 'DOCUMENT_VERIFICATION_PENDING', label: 'Document Verification Pending', badgeClass: 'badge-warning' };
  }
  if (driver.accountStatus === 'DOCUMENTS_SUBMITTED' || driver.verificationStatus === 'DOCUMENTS_SUBMITTED' || driver.verificationStatus === 'SUBMITTED') {
    return { key: 'DOCUMENTS_SUBMITTED', label: 'Documents Submitted', badgeClass: 'badge-warning' };
  }

  return { key: 'REGISTERED', label: 'Registered', badgeClass: 'badge-neutral' };
};

/**
 * Evaluates whether a driver document matches a specific lifecycle state filter key.
 */
export const matchesLifecycleState = (driver, filterKey) => {
  if (!driver || !filterKey || filterKey === 'ALL') return true;

  const isSuspended = Boolean(driver.isSuspended || driver.status === 'SUSPENDED' || driver.accountStatus === 'SUSPENDED');
  const isRejected = Boolean(driver.accountStatus === 'REJECTED' || driver.approvalStatus === 'REJECTED' || driver.status === 'REJECTED');
  const isClosed = Boolean(driver.accountStatus === 'ACCOUNT_CLOSED' || driver.status === 'CLOSED');

  // Terminal lifecycle queries match directly
  if (filterKey === 'SUSPENDED') return isSuspended;
  if (filterKey === 'REJECTED') return isRejected;
  if (filterKey === 'ACCOUNT_CLOSED') return isClosed;

  // If driver has terminated status, do not include in active funnel filters
  if (isSuspended || isRejected || isClosed) return false;

  const hasBike = Boolean(driver.assignedBikeId || driver.assignedBikeRegistration);
  const isApproved = driver.approvalStatus === 'APPROVED' || 
                     driver.accountStatus === 'APPROVED' || 
                     driver.accountStatus === 'APPROVED_BIKE_NOT_ASSIGNED' || 
                     driver.accountStatus === 'BIKE_ASSIGNED' || 
                     driver.accountStatus === 'BIKE_HANDOVER_PENDING' || 
                     driver.accountStatus === 'ACTIVE_DRIVER';

  switch (filterKey) {
    case 'REGISTERED':
      return (
        driver.accountStatus === 'REGISTERED' ||
        (!driver.accountStatus && !driver.approvalStatus && !driver.verificationStatus && !hasBike) ||
        driver.verificationStatus === 'NOT_SUBMITTED'
      );

    case 'DOCUMENTS_SUBMITTED':
      return (
        driver.accountStatus === 'DOCUMENTS_SUBMITTED' ||
        driver.verificationStatus === 'DOCUMENTS_SUBMITTED' ||
        driver.verificationStatus === 'SUBMITTED'
      );

    case 'DOCUMENT_VERIFICATION_PENDING':
      return (
        driver.accountStatus === 'DOCUMENT_VERIFICATION_PENDING' ||
        (driver.verificationStatus === 'PENDING' && !isApproved)
      );

    case 'ADDRESS_VERIFICATION_PENDING':
      return (
        driver.accountStatus === 'ADDRESS_VERIFICATION_PENDING' ||
        (driver.verificationStatus === 'DOCUMENTS_VERIFIED' && !driver.addressVerified && !isApproved)
      );

    case 'APPROVED':
      return isApproved;

    case 'APPROVED_BIKE_NOT_ASSIGNED':
      return isApproved && !hasBike;

    case 'BIKE_ASSIGNED':
      return hasBike || driver.accountStatus === 'BIKE_ASSIGNED';

    case 'BIKE_HANDOVER_PENDING':
      return (
        driver.accountStatus === 'BIKE_HANDOVER_PENDING' ||
        (hasBike && !driver.handoverCompletedAt && driver.accountStatus !== 'ACTIVE_DRIVER')
      );

    case 'ACTIVE_DRIVER':
      return (
        driver.accountStatus === 'ACTIVE_DRIVER' ||
        (hasBike && (driver.handoverCompletedAt || driver.isCurrentlyOnDuty || driver.status === 'ACTIVE'))
      );

    default:
      return driver.accountStatus === filterKey;
  }
};
