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
