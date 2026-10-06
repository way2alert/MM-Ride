import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  CircleDollarSign,
  Fuel,
  Users,
  Receipt,
  Calendar,
  Download,
  Eye,
  CheckCircle2,
  AlertCircle,
  Gauge,
  CreditCard,
  Banknote,
  Sparkles,
  ChevronRight,
  X,
  Clock,
  MapPin,
  RefreshCw
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export default function DailyProfitLoss() {
  const [rideEntries, setRideEntries] = useState([]);
  const [fuelExpenses, setFuelExpenses] = useState([]);
  const [dutySessions, setDutySessions] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [systemSettings, setSystemSettings] = useState({
    workerSharePercent: 50,
    ownerSharePercent: 50,
    reserveHoldPercent: 10
  });

  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [dateFilterMode, setDateFilterMode] = useState('today'); // 'today' | 'yesterday' | '7days' | 'month' | 'custom'
  const [detailModalDay, setDetailModalDay] = useState(null);
  const [viewingProof, setViewingProof] = useState(null);

  // 1. Subscribe to real-time collections
  useEffect(() => {
    setLoading(true);

    // Shift ride entries
    const unsubRides = onSnapshot(collection(db, 'shiftRideEntries'), (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRideEntries(items);
    });

    // Fuel expenses
    const unsubFuel = onSnapshot(collection(db, 'fuelExpenses'), (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setFuelExpenses(items);
    });

    // Duty sessions
    const unsubDuties = onSnapshot(collection(db, 'dutySessions'), (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDutySessions(items);
    });

    // Drivers
    const unsubDrivers = onSnapshot(collection(db, 'drivers'), (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDrivers(items);
      setLoading(false);
    });

    // System Settings (Split Rules)
    const unsubSettings = onSnapshot(doc(db, 'settings', 'system'), (snap) => {
      if (snap.exists()) {
        setSystemSettings(prev => ({ ...prev, ...snap.data() }));
      }
    });

    return () => {
      unsubRides();
      unsubFuel();
      unsubDuties();
      unsubDrivers();
      unsubSettings();
    };
  }, []);

  // Helper to extract YYYY-MM-DD from various timestamp formats
  const extractDateStr = (timestamp) => {
    if (!timestamp) return null;
    if (typeof timestamp === 'string') {
      return timestamp.split('T')[0];
    }
    if (timestamp?.toDate && typeof timestamp.toDate === 'function') {
      return timestamp.toDate().toISOString().split('T')[0];
    }
    if (timestamp?.seconds) {
      return new Date(timestamp.seconds * 1000).toISOString().split('T')[0];
    }
    return null;
  };

  const getDriverName = (driverId) => {
    const d = drivers.find(drv => drv.id === driverId);
    return d ? (d.fullName || d.name) : 'Fleet Driver';
  };

  // Group all entries by Date (YYYY-MM-DD)
  const dailyLedger = useMemo(() => {
    const datesMap = {};

    // 1. Ingest Ride Entries
    rideEntries.forEach(entry => {
      const dateStr = extractDateStr(entry.timestamp || entry.createdAt);
      if (!dateStr) return;

      if (!datesMap[dateStr]) {
        datesMap[dateStr] = {
          date: dateStr,
          driverId: entry.driverId,
          rides: [],
          fuel: [],
          duties: [],
          grossRevenue: 0,
          totalRides: 0,
          cashRevenue: 0,
          upiRevenue: 0,
          platforms: { OLA: 0, UBER: 0, RAPIDO: 0, OTHER: 0 },
          fuelCost: 0,
          fuelLitres: 0,
          fuelKg: 0,
          startOdometer: null,
          endOdometer: null,
          maxOdometer: null
        };
      }

      const fare = Number(entry.fare) || 0;
      datesMap[dateStr].rides.push(entry);
      datesMap[dateStr].grossRevenue += fare;
      datesMap[dateStr].totalRides += 1;

      if (entry.paymentMethod === 'CASH') {
        datesMap[dateStr].cashRevenue += fare;
      } else {
        datesMap[dateStr].upiRevenue += fare;
      }

      const pKey = (entry.platform || 'OTHER').toUpperCase();
      datesMap[dateStr].platforms[pKey] = (datesMap[dateStr].platforms[pKey] || 0) + fare;
    });

    // 2. Ingest Fuel Expenses
    fuelExpenses.forEach(f => {
      const dateStr = extractDateStr(f.timestamp || f.date || f.createdAt);
      if (!dateStr) return;

      if (!datesMap[dateStr]) {
        datesMap[dateStr] = {
          date: dateStr,
          driverId: f.driverId,
          rides: [],
          fuel: [],
          duties: [],
          grossRevenue: 0,
          totalRides: 0,
          cashRevenue: 0,
          upiRevenue: 0,
          platforms: { OLA: 0, UBER: 0, RAPIDO: 0, OTHER: 0 },
          fuelCost: 0,
          fuelLitres: 0,
          fuelKg: 0,
          startOdometer: null,
          endOdometer: null,
          maxOdometer: null
        };
      }

      const isCng = f.fuelType === 'CNG' || f.unit === 'KG' || Boolean(f.kg);
      const amt = Number(f.amount) || 0;
      const litres = !isCng ? (Number(f.litres || f.quantity) || 0) : 0;
      const kg = isCng ? (Number(f.kg || f.quantity || f.litres) || 0) : 0;
      datesMap[dateStr].fuel.push(f);
      datesMap[dateStr].fuelCost += amt;
      datesMap[dateStr].fuelLitres += litres;
      datesMap[dateStr].fuelKg = (datesMap[dateStr].fuelKg || 0) + kg;

      if (f.odometerAtFill) {
        const odo = Number(f.odometerAtFill);
        if (!datesMap[dateStr].maxOdometer || odo > datesMap[dateStr].maxOdometer) {
          datesMap[dateStr].maxOdometer = odo;
        }
      }
    });

    // 3. Ingest Duty Sessions
    dutySessions.forEach(ds => {
      const dateStr = extractDateStr(ds.startTime || ds.createdAt);
      if (!dateStr) return;

      if (!datesMap[dateStr]) {
        datesMap[dateStr] = {
          date: dateStr,
          driverId: ds.driverId,
          rides: [],
          fuel: [],
          duties: [],
          grossRevenue: 0,
          totalRides: 0,
          cashRevenue: 0,
          upiRevenue: 0,
          platforms: { OLA: 0, UBER: 0, RAPIDO: 0, OTHER: 0 },
          fuelCost: 0,
          fuelLitres: 0,
          fuelKg: 0,
          startOdometer: null,
          endOdometer: null,
          maxOdometer: null
        };
      }

      datesMap[dateStr].duties.push(ds);

      if (ds.pickupOdometer) {
        const startOdo = Number(ds.pickupOdometer);
        if (!datesMap[dateStr].startOdometer || startOdo < datesMap[dateStr].startOdometer) {
          datesMap[dateStr].startOdometer = startOdo;
        }
      }

      if (ds.returnOdometer) {
        const endOdo = Number(ds.returnOdometer);
        if (!datesMap[dateStr].endOdometer || endOdo > datesMap[dateStr].endOdometer) {
          datesMap[dateStr].endOdometer = endOdo;
        }
      }
    });

    // Compute Derived Financials for each date with 50% Owner / 50% Driver Shared Fuel Model
    const workerSplit = (systemSettings.workerSharePercent || 50) / 100;
    const list = Object.values(datesMap).map(row => {
      const driverShare = Math.round(row.grossRevenue * workerSplit * 100) / 100;
      const ownerGrossShare = Math.round((row.grossRevenue - driverShare) * 100) / 100;

      // 50% Owner and 50% Driver shared fuel model (Petrol & CNG)
      const ownerFuelCost = Math.round((row.fuelCost * 0.5) * 100) / 100;
      const driverFuelCost = Math.round((row.fuelCost * 0.5) * 100) / 100;
      const ownerNetProfit = Math.round((ownerGrossShare - ownerFuelCost) * 100) / 100;
      const driverNetEarnings = Math.round((driverShare - driverFuelCost) * 100) / 100;

      const profitMarginPercent = row.grossRevenue > 0 
        ? Math.round((ownerNetProfit / row.grossRevenue) * 1000) / 10 
        : 0;

      // Distance calculation
      let distanceKm = 0;
      if (row.endOdometer && row.startOdometer && row.endOdometer > row.startOdometer) {
        distanceKm = row.endOdometer - row.startOdometer;
      } else if (row.maxOdometer && row.startOdometer && row.maxOdometer > row.startOdometer) {
        distanceKm = row.maxOdometer - row.startOdometer;
      }

      const mileageKmpl = (distanceKm > 0 && row.fuelLitres > 0)
        ? Math.round((distanceKm / row.fuelLitres) * 10) / 10
        : null;

      const fuelCostPerKm = (distanceKm > 0 && row.fuelCost > 0)
        ? Math.round((row.fuelCost / distanceKm) * 100) / 100
        : null;

      return {
        ...row,
        driverShare,
        ownerGrossShare,
        ownerFuelCost,
        driverFuelCost,
        driverNetEarnings,
        ownerNetProfit,
        profitMarginPercent,
        isProfit: ownerNetProfit >= 0,
        distanceKm,
        mileageKmpl,
        fuelCostPerKm
      };
    });

    // Sort descending by date
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [rideEntries, fuelExpenses, dutySessions, systemSettings]);

  // Today string
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

  // Filtered Ledger based on selection
  const filteredLedger = useMemo(() => {
    if (dateFilterMode === 'today') {
      return dailyLedger.filter(d => d.date === todayStr);
    }
    if (dateFilterMode === 'yesterday') {
      return dailyLedger.filter(d => d.date === yesterdayStr);
    }
    if (dateFilterMode === '7days') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      return dailyLedger.filter(d => d.date >= cutoffStr);
    }
    if (dateFilterMode === 'month') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      return dailyLedger.filter(d => d.date >= cutoffStr);
    }
    if (dateFilterMode === 'custom' && selectedDate) {
      return dailyLedger.filter(d => d.date === selectedDate);
    }
    return dailyLedger;
  }, [dailyLedger, dateFilterMode, selectedDate, todayStr, yesterdayStr]);

  // Aggregated Summary for the selected filter view
  const currentSummary = useMemo(() => {
    const totalGross = filteredLedger.reduce((sum, r) => sum + r.grossRevenue, 0);
    const totalDriverShare = filteredLedger.reduce((sum, r) => sum + r.driverShare, 0);
    const totalFuelCost = filteredLedger.reduce((sum, r) => sum + r.fuelCost, 0);
    const totalOwnerFuelCost = filteredLedger.reduce((sum, r) => sum + (r.ownerFuelCost || 0), 0);
    const totalDriverFuelCost = filteredLedger.reduce((sum, r) => sum + (r.driverFuelCost || 0), 0);
    const totalFuelLitres = filteredLedger.reduce((sum, r) => sum + (r.fuelLitres || 0), 0);
    const totalFuelKg = filteredLedger.reduce((sum, r) => sum + (r.fuelKg || 0), 0);
    const totalNetProfit = filteredLedger.reduce((sum, r) => sum + r.ownerNetProfit, 0);
    const totalRides = filteredLedger.reduce((sum, r) => sum + r.totalRides, 0);
    const totalCash = filteredLedger.reduce((sum, r) => sum + r.cashRevenue, 0);
    const totalUpi = filteredLedger.reduce((sum, r) => sum + r.upiRevenue, 0);
    const totalDistance = filteredLedger.reduce((sum, r) => sum + r.distanceKm, 0);

    const marginPercent = totalGross > 0
      ? Math.round((totalNetProfit / totalGross) * 1000) / 10
      : 0;

    const avgMileage = (totalDistance > 0 && totalFuelLitres > 0)
      ? Math.round((totalDistance / totalFuelLitres) * 10) / 10
      : null;

    const platforms = { OLA: 0, UBER: 0, RAPIDO: 0 };
    filteredLedger.forEach(r => {
      platforms.OLA += r.platforms.OLA || 0;
      platforms.UBER += r.platforms.UBER || 0;
      platforms.RAPIDO += r.platforms.RAPIDO || 0;
    });

    return {
      totalGross,
      totalDriverShare,
      totalFuelCost,
      totalFuelLitres,
      totalFuelKg,
      totalNetProfit,
      totalRides,
      totalCash,
      totalUpi,
      totalDistance,
      marginPercent,
      avgMileage,
      platforms,
      isProfit: totalNetProfit >= 0
    };
  }, [filteredLedger]);

  // Quick Date presets
  const handlePresetChange = (preset) => {
    setDateFilterMode(preset);
    if (preset === 'today') setSelectedDate(todayStr);
    if (preset === 'yesterday') setSelectedDate(yesterdayStr);
  };

  // CSV Export
  const handleExportCsv = () => {
    const headers = [
      'Date',
      'Driver Name',
      'Total Rides',
      'Gross Revenue (INR)',
      'Driver Share (50%)',
      'Fuel Expense (INR)',
      'Fuel Litres (L)',
      'Owner Net Profit (INR)',
      'Profit Margin (%)',
      'Distance Driven (KM)',
      'Real Mileage (KM/L)',
      'Status'
    ];

    const rows = filteredLedger.map(r => [
      r.date,
      `"${getDriverName(r.driverId)}"`,
      r.totalRides,
      r.grossRevenue.toFixed(2),
      r.driverShare.toFixed(2),
      r.fuelCost.toFixed(2),
      r.fuelLitres.toFixed(1),
      r.ownerNetProfit.toFixed(2),
      `${r.profitMarginPercent}%`,
      r.distanceKm || 0,
      r.mileageKmpl || 'N/A',
      r.isProfit ? 'PROFIT' : 'LOSS'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + 
      [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `MM_Ride_Profit_Loss_${dateFilterMode}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: 1440, margin: '0 auto' }}>
      {/* 1. Header & Live Indicator */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
            <div style={{
              background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
              color: '#000',
              padding: '0.45rem',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 15px rgba(245, 158, 11, 0.3)'
            }}>
              <TrendingUp size={22} />
            </div>
            <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#FFF', margin: 0, letterSpacing: '-0.02em' }}>
              Daily Profit & Loss Ledger
            </h1>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 20,
              padding: '0.25rem 0.65rem',
              fontSize: '0.75rem',
              color: '#10B981',
              fontWeight: 700
            }}>
              <span style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#10B981',
                boxShadow: '0 0 8px #10B981'
              }} />
              LIVE REAL-TIME SYNC
            </div>
          </div>
          <p style={{ color: '#94A3B8', fontSize: '0.88rem', margin: 0 }}>
            Real-time unit economics per day: Ride Fares (Ola/Uber/Rapido) minus Driver 50% Share minus Petrol Costs = True Owner Bottom Line
          </p>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleExportCsv}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#E2E8F0',
              padding: '0.6rem 1rem',
              borderRadius: 10,
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
          >
            <Download size={16} />
            Export P&L CSV
          </button>
        </div>
      </div>

      {/* 2. Date Navigation Filter Bar */}
      <div style={{
        background: 'rgba(17, 24, 39, 0.7)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        padding: '0.85rem 1.2rem',
        marginBottom: '1.75rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem'
      }}>
        {/* Presets */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: 600, marginRight: '0.25rem' }}>
            VIEW PERIOD:
          </span>
          {[
            { id: 'today', label: 'Today (Live)' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: '7days', label: 'Past 7 Days' },
            { id: 'month', label: 'Past 30 Days' },
            { id: 'all', label: 'All History' }
          ].map(p => {
            const active = dateFilterMode === p.id;
            return (
              <button
                key={p.id}
                onClick={() => handlePresetChange(p.id)}
                style={{
                  background: active ? '#F59E0B' : 'rgba(255, 255, 255, 0.05)',
                  color: active ? '#000' : '#CBD5E1',
                  border: active ? '1px solid #F59E0B' : '1px solid rgba(255, 255, 255, 0.08)',
                  padding: '0.45rem 0.9rem',
                  borderRadius: 8,
                  fontSize: '0.82rem',
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Custom Date Picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Calendar size={16} style={{ color: '#F59E0B' }} />
          <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Select Date:</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setDateFilterMode('custom');
            }}
            style={{
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 8,
              padding: '0.4rem 0.75rem',
              color: '#FFF',
              fontSize: '0.85rem',
              outline: 'none',
              cursor: 'pointer'
            }}
          />
        </div>
      </div>

      {/* 3. Top 5 Executive Hero KPI Cards for Current View */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '1rem',
        marginBottom: '1.75rem'
      }}>
        {/* Card 1: Gross Revenue */}
        <div style={{
          background: 'rgba(17, 24, 39, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 14,
          padding: '1.25rem',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                1. Gross Ride Fares
              </span>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#FFF', marginTop: '0.35rem' }}>
                ₹{currentSummary.totalGross.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              padding: '0.6rem',
              borderRadius: 10,
              color: '#F59E0B'
            }}>
              <Receipt size={22} />
            </div>
          </div>
          <div style={{ marginTop: '0.85rem', paddingTop: '0.65rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)', fontSize: '0.78rem', color: '#94A3B8' }}>
            <b>{currentSummary.totalRides} Rides</b> Logged • Cash: ₹{currentSummary.totalCash} | UPI: ₹{currentSummary.totalUpi}
          </div>
        </div>

        {/* Card 2: Driver Share (50%) */}
        <div style={{
          background: 'rgba(17, 24, 39, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 14,
          padding: '1.25rem',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                2. Driver Share ({systemSettings.workerSharePercent || 50}%)
              </span>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#60A5FA', marginTop: '0.35rem' }}>
                ₹{currentSummary.totalDriverShare.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{
              background: 'rgba(59, 130, 246, 0.12)',
              border: '1px solid rgba(59, 130, 246, 0.25)',
              padding: '0.6rem',
              borderRadius: 10,
              color: '#3B82F6'
            }}>
              <Users size={22} />
            </div>
          </div>
          <div style={{ marginTop: '0.85rem', paddingTop: '0.65rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)', fontSize: '0.78rem', color: '#94A3B8' }}>
            Driver Payout earned by <b>Shivkumar</b>
          </div>
        </div>

        {/* Card 3: Fuel Expense (50% Owner / 50% Driver Shared) */}
        <div style={{
          background: 'rgba(17, 24, 39, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 14,
          padding: '1.25rem',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                3. Fuel Expense (50% Owner Share: ₹{totalOwnerFuelCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })})
              </span>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#F87171', marginTop: '0.35rem' }}>
                ₹{currentSummary.totalFuelCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              padding: '0.6rem',
              borderRadius: 10,
              color: '#EF4444'
            }}>
              <Fuel size={22} />
            </div>
          </div>
          <div style={{ marginTop: '0.85rem', paddingTop: '0.65rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)', fontSize: '0.78rem', color: '#94A3B8' }}>
            <b>50% Owner: ₹{totalOwnerFuelCost.toFixed(2)}</b> • <b>50% Driver: ₹{totalDriverFuelCost.toFixed(2)}</b> ({currentSummary.totalFuelKg > 0 ? `${currentSummary.totalFuelLitres.toFixed(1)} L / ${currentSummary.totalFuelKg.toFixed(1)} kg CNG` : `${currentSummary.totalFuelLitres.toFixed(1)} Litres`})
          </div>
        </div>

        {/* Card 4: Owner Net Profit / Loss */}
        <div style={{
          background: currentSummary.isProfit 
            ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(17, 24, 39, 0.95) 100%)' 
            : 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(17, 24, 39, 0.95) 100%)',
          border: currentSummary.isProfit ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: 14,
          padding: '1.25rem',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: currentSummary.isProfit ? '0 8px 25px rgba(16, 185, 129, 0.15)' : '0 8px 25px rgba(239, 68, 68, 0.15)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '0.15rem 0.5rem',
                  borderRadius: 4,
                  background: currentSummary.isProfit ? '#10B981' : '#EF4444',
                  color: '#000',
                  letterSpacing: '0.05em'
                }}>
                  {currentSummary.isProfit ? 'NET PROFIT' : 'NET LOSS'}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                  ({currentSummary.marginPercent}%)
                </span>
              </div>
              <div style={{
                fontSize: '1.95rem',
                fontWeight: 800,
                color: currentSummary.isProfit ? '#10B981' : '#EF4444',
                marginTop: '0.35rem'
              }}>
                {currentSummary.isProfit ? '+' : ''}₹{currentSummary.totalNetProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{
              background: currentSummary.isProfit ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              border: currentSummary.isProfit ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
              padding: '0.6rem',
              borderRadius: 10,
              color: currentSummary.isProfit ? '#10B981' : '#EF4444'
            }}>
              {currentSummary.isProfit ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
            </div>
          </div>
          <div style={{ marginTop: '0.85rem', paddingTop: '0.65rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)', fontSize: '0.78rem', color: '#CBD5E1' }}>
            Gross (₹{currentSummary.totalGross}) - Share (₹{currentSummary.totalDriverShare}) - Fuel (₹{currentSummary.totalFuelCost})
          </div>
        </div>

        {/* Card 5: Real-World Efficiency & Mileage */}
        <div style={{
          background: 'rgba(17, 24, 39, 0.8)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 14,
          padding: '1.25rem',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                5. Distance & Mileage
              </span>
              <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#A78BFA', marginTop: '0.35rem' }}>
                {currentSummary.avgMileage ? `${currentSummary.avgMileage} km/L` : (currentSummary.totalDistance ? `${currentSummary.totalDistance} km` : '—')}
              </div>
            </div>
            <div style={{
              background: 'rgba(139, 92, 246, 0.12)',
              border: '1px solid rgba(139, 92, 246, 0.25)',
              padding: '0.6rem',
              borderRadius: 10,
              color: '#8B5CF6'
            }}>
              <Gauge size={22} />
            </div>
          </div>
          <div style={{ marginTop: '0.85rem', paddingTop: '0.65rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)', fontSize: '0.78rem', color: '#94A3B8' }}>
            <b>{currentSummary.totalDistance} km</b> driven fleet-wide
          </div>
        </div>
      </div>

      {/* 4. Platform Contribution Bar */}
      <div style={{
        background: 'rgba(17, 24, 39, 0.7)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        padding: '1.25rem',
        marginBottom: '1.75rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={18} style={{ color: '#F59E0B' }} />
            <span style={{ fontWeight: 700, color: '#FFF', fontSize: '0.92rem' }}>
              Platform Fares Breakdown (Uber vs Ola vs Rapido)
            </span>
          </div>
          <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
            Total Fares: <b>₹{currentSummary.totalGross}</b>
          </span>
        </div>

        {/* Visual Progress Bar */}
        <div style={{
          height: 12,
          borderRadius: 6,
          background: 'rgba(255, 255, 255, 0.05)',
          display: 'flex',
          overflow: 'hidden',
          marginBottom: '1rem'
        }}>
          {currentSummary.totalGross > 0 ? (
            <>
              <div
                title={`Uber: ₹${currentSummary.platforms.UBER}`}
                style={{
                  width: `${(currentSummary.platforms.UBER / currentSummary.totalGross) * 100}%`,
                  background: '#000000',
                  borderRight: '1px solid #333'
                }}
              />
              <div
                title={`Ola: ₹${currentSummary.platforms.OLA}`}
                style={{
                  width: `${(currentSummary.platforms.OLA / currentSummary.totalGross) * 100}%`,
                  background: '#F59E0B'
                }}
              />
              <div
                title={`Rapido: ₹${currentSummary.platforms.RAPIDO}`}
                style={{
                  width: `${(currentSummary.platforms.RAPIDO / currentSummary.totalGross) * 100}%`,
                  background: '#EAB308'
                }}
              />
            </>
          ) : (
            <div style={{ width: '100%', background: 'rgba(255, 255, 255, 0.05)' }} />
          )}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#FFF' }} />
            <span style={{ color: '#E2E8F0' }}>Uber:</span>
            <b style={{ color: '#FFF' }}>₹{currentSummary.platforms.UBER}</b>
            <span style={{ color: '#94A3B8' }}>
              ({currentSummary.totalGross > 0 ? Math.round((currentSummary.platforms.UBER / currentSummary.totalGross) * 100) : 0}%)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#F59E0B' }} />
            <span style={{ color: '#E2E8F0' }}>Ola:</span>
            <b style={{ color: '#F59E0B' }}>₹{currentSummary.platforms.OLA}</b>
            <span style={{ color: '#94A3B8' }}>
              ({currentSummary.totalGross > 0 ? Math.round((currentSummary.platforms.OLA / currentSummary.totalGross) * 100) : 0}%)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem' }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: '#EAB308' }} />
            <span style={{ color: '#E2E8F0' }}>Rapido:</span>
            <b style={{ color: '#EAB308' }}>₹{currentSummary.platforms.RAPIDO}</b>
            <span style={{ color: '#94A3B8' }}>
              ({currentSummary.totalGross > 0 ? Math.round((currentSummary.platforms.RAPIDO / currentSummary.totalGross) * 100) : 0}%)
            </span>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#10B981' }}>
              <Banknote size={15} />
              <span>Cash in Hand: <b>₹{currentSummary.totalCash}</b></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#38BDF8' }}>
              <CreditCard size={15} />
              <span>Online/UPI: <b>₹{currentSummary.totalUpi}</b></span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Day-by-Day Historical P&L Table */}
      <div style={{
        background: 'rgba(17, 24, 39, 0.8)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '1.1rem 1.25rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#FFF', margin: 0 }}>
              Day-by-Day Financial Breakdown
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
              Showing {filteredLedger.length} active operational days recorded in Firebase
            </span>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'rgba(0, 0, 0, 0.3)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <th style={{ padding: '0.85rem 1.1rem', color: '#94A3B8', fontWeight: 600 }}>Date</th>
                <th style={{ padding: '0.85rem 1.1rem', color: '#94A3B8', fontWeight: 600 }}>Driver</th>
                <th style={{ padding: '0.85rem 1.1rem', color: '#94A3B8', fontWeight: 600, textAlign: 'center' }}>Rides</th>
                <th style={{ padding: '0.85rem 1.1rem', color: '#94A3B8', fontWeight: 600, textAlign: 'right' }}>Gross Revenue</th>
                <th style={{ padding: '0.85rem 1.1rem', color: '#94A3B8', fontWeight: 600, textAlign: 'right' }}>Driver Share (50%)</th>
                <th style={{ padding: '0.85rem 1.1rem', color: '#94A3B8', fontWeight: 600, textAlign: 'right' }}>Fuel Expense</th>
                <th style={{ padding: '0.85rem 1.1rem', color: '#94A3B8', fontWeight: 600, textAlign: 'right' }}>Owner Net (P&L)</th>
                <th style={{ padding: '0.85rem 1.1rem', color: '#94A3B8', fontWeight: 600, textAlign: 'center' }}>Margin %</th>
                <th style={{ padding: '0.85rem 1.1rem', color: '#94A3B8', fontWeight: 600, textAlign: 'center' }}>KM / Mileage</th>
                <th style={{ padding: '0.85rem 1.1rem', color: '#94A3B8', fontWeight: 600, textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredLedger.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '3rem', textAlign: 'center', color: '#94A3B8' }}>
                    No ride entries or fuel logs found for the selected period.
                  </td>
                </tr>
              ) : (
                filteredLedger.map((row) => {
                  const isToday = row.date === todayStr;
                  return (
                    <tr
                      key={row.date}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                        background: isToday ? 'rgba(245, 158, 11, 0.04)' : 'transparent',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
                      onMouseOut={(e) => e.currentTarget.style.background = isToday ? 'rgba(245, 158, 11, 0.04)' : 'transparent'}
                    >
                      {/* Date */}
                      <td style={{ padding: '0.9rem 1.1rem', color: '#FFF', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span>{row.date}</span>
                          {isToday && (
                            <span style={{
                              fontSize: '0.68rem',
                              background: '#F59E0B',
                              color: '#000',
                              fontWeight: 800,
                              padding: '0.15rem 0.45rem',
                              borderRadius: 4
                            }}>
                              TODAY
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Driver */}
                      <td style={{ padding: '0.9rem 1.1rem', color: '#CBD5E1' }}>
                        {getDriverName(row.driverId)}
                      </td>

                      {/* Rides Count */}
                      <td style={{ padding: '0.9rem 1.1rem', textAlign: 'center' }}>
                        <span style={{
                          background: 'rgba(255, 255, 255, 0.08)',
                          padding: '0.2rem 0.6rem',
                          borderRadius: 12,
                          fontWeight: 700,
                          color: '#FFF'
                        }}>
                          {row.totalRides}
                        </span>
                      </td>

                      {/* Gross Revenue */}
                      <td style={{ padding: '0.9rem 1.1rem', textAlign: 'right', fontWeight: 700, color: '#FFF' }}>
                        ₹{row.grossRevenue.toFixed(2)}
                      </td>

                      {/* Driver Share */}
                      <td style={{ padding: '0.9rem 1.1rem', textAlign: 'right', color: '#60A5FA', fontWeight: 600 }}>
                        ₹{row.driverShare.toFixed(2)}
                      </td>

                      {/* Fuel Expense (Total and 50% Owner Split) */}
                      <td style={{ padding: '0.9rem 1.1rem', textAlign: 'right', color: '#F87171', fontWeight: 600 }}>
                        {row.fuelCost > 0 ? (
                          <div>
                            <div>₹{row.fuelCost.toFixed(2)}</div>
                            <div style={{ fontSize: '0.7rem', color: '#60A5FA', fontWeight: 500 }}>
                              Owner 50%: ₹{row.ownerFuelCost.toFixed(2)}
                            </div>
                          </div>
                        ) : '—'}
                      </td>

                      {/* Owner Net Profit */}
                      <td style={{ padding: '0.9rem 1.1rem', textAlign: 'right' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontWeight: 800,
                          color: row.isProfit ? '#10B981' : '#EF4444'
                        }}>
                          {row.isProfit ? '+' : ''}₹{row.ownerNetProfit.toFixed(2)}
                        </span>
                      </td>

                      {/* Margin % */}
                      <td style={{ padding: '0.9rem 1.1rem', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '0.75rem',
                          padding: '0.2rem 0.55rem',
                          borderRadius: 6,
                          fontWeight: 700,
                          background: row.isProfit ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: row.isProfit ? '#10B981' : '#EF4444'
                        }}>
                          {row.profitMarginPercent}%
                        </span>
                      </td>

                      {/* KM / Mileage */}
                      <td style={{ padding: '0.9rem 1.1rem', textAlign: 'center', color: '#94A3B8' }}>
                        {row.distanceKm > 0 ? (
                          <div>
                            <b>{row.distanceKm} km</b>
                            {row.mileageKmpl && (
                              <div style={{ fontSize: '0.72rem', color: '#A78BFA' }}>
                                {row.mileageKmpl} km/L
                              </div>
                            )}
                          </div>
                        ) : '—'}
                      </td>

                      {/* Action */}
                      <td style={{ padding: '0.9rem 1.1rem', textAlign: 'center' }}>
                        <button
                          onClick={() => setDetailModalDay(row)}
                          style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: 6,
                            padding: '0.35rem 0.65rem',
                            color: '#E2E8F0',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}
                        >
                          <Eye size={13} />
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Day Detail Modal */}
      {detailModalDay && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1.5rem'
        }}>
          <div style={{
            background: '#111726',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 16,
            width: '100%',
            maxWidth: 780,
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7)'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#FFF', margin: 0 }}>
                  Day Ledger Details: {detailModalDay.date}
                </h3>
                <span style={{ fontSize: '0.82rem', color: '#94A3B8' }}>
                  Driver: <b>{getDriverName(detailModalDay.driverId)}</b>{detailModalDay.driverId && (() => {
                    const d = drivers.find(drv => drv.id === detailModalDay.driverId);
                    return d?.assignedBikeRegistration ? ` • ${d.assignedBikeRegistration}` : '';
                  })()}
                </span>
              </div>
              <button
                onClick={() => setDetailModalDay(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94A3B8',
                  cursor: 'pointer',
                  padding: 4
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
              {/* Daily Metric Badges */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '0.75rem',
                marginBottom: '1.5rem'
              }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>GROSS FARES</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#FFF' }}>
                    ₹{detailModalDay.grossRevenue.toFixed(2)}
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>DRIVER SHARE (50%)</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#60A5FA' }}>
                    ₹{detailModalDay.driverShare.toFixed(2)}
                  </div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>FUEL EXPENSE</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#F87171' }}>
                    ₹{detailModalDay.fuelCost.toFixed(2)}
                  </div>
                </div>
                <div style={{
                  background: detailModalDay.isProfit ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  padding: '0.75rem',
                  borderRadius: 8
                }}>
                  <div style={{ fontSize: '0.72rem', color: detailModalDay.isProfit ? '#10B981' : '#EF4444', fontWeight: 700 }}>
                    OWNER NET
                  </div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 800, color: detailModalDay.isProfit ? '#10B981' : '#EF4444' }}>
                    {detailModalDay.isProfit ? '+' : ''}₹{detailModalDay.ownerNetProfit.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Rides List */}
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#FFF', marginBottom: '0.75rem' }}>
                Logged Ride Entries ({detailModalDay.rides.length})
              </h4>
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, overflow: 'hidden', marginBottom: '1.5rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94A3B8' }}>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Time</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Platform</th>
                      <th style={{ padding: '0.6rem 0.8rem' }}>Payment</th>
                      <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Fare</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailModalDay.rides.length === 0 ? (
                      <tr><td colSpan={4} style={{ padding: '1rem', textAlign: 'center', color: '#94A3B8' }}>No individual ride entries logged</td></tr>
                    ) : (
                      detailModalDay.rides.map((ride, idx) => (
                        <tr key={ride.id || idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '0.6rem 0.8rem', color: '#CBD5E1' }}>
                            {ride.timestamp ? new Date(ride.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td style={{ padding: '0.6rem 0.8rem' }}>
                            <span style={{
                              fontWeight: 700,
                              color: ride.platform === 'UBER' ? '#FFF' : '#F59E0B'
                            }}>
                              {ride.platform}
                            </span>
                          </td>
                          <td style={{ padding: '0.6rem 0.8rem', color: '#94A3B8' }}>
                            {ride.paymentMethod || 'UPI'}
                          </td>
                          <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', fontWeight: 700, color: '#10B981' }}>
                            ₹{Number(ride.fare).toFixed(2)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Fuel Receipts for the Day */}
              {detailModalDay.fuel.length > 0 && (
                <>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#FFF', marginBottom: '0.75rem' }}>
                    Fuel Claims & Pump Proof ({detailModalDay.fuel.length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {detailModalDay.fuel.map(f => (
                      <div
                        key={f.id}
                        style={{
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: 8,
                          padding: '0.75rem 1rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <div>
                          <div style={{ color: '#FFF', fontWeight: 700, fontSize: '0.9rem' }}>
                            ₹{Number(f.amount).toFixed(2)} • {f.litres} Litres
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: 2 }}>
                            Odometer at Fill: <b>{f.odometerAtFill ? `${f.odometerAtFill} km` : 'N/A'}</b> • Status: {f.status}
                          </div>
                        </div>

                        {f.dispenserPhotoUrl && (
                          <button
                            onClick={() => setViewingProof(f.dispenserPhotoUrl)}
                            style={{
                              background: 'rgba(245, 158, 11, 0.15)',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                              color: '#F59E0B',
                              padding: '0.35rem 0.75rem',
                              borderRadius: 6,
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            View Pump Photo
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. Image Proof Viewer Modal */}
      {viewingProof && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.85)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem'
        }}>
          <div style={{ position: 'relative', maxWidth: 600, width: '100%', textAlign: 'center' }}>
            <button
              onClick={() => setViewingProof(null)}
              style={{
                position: 'absolute',
                top: -40,
                right: 0,
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: '50%',
                color: '#FFF',
                width: 36,
                height: 36,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={20} />
            </button>
            <img
              src={viewingProof}
              alt="Pump Meter Proof"
              style={{
                width: '100%',
                maxHeight: '80vh',
                objectFit: 'contain',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.2)'
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
