import React from 'react';

export default function ParentPortal() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">Parent Portal</h2>
        <p className="mt-2 text-sm text-slate-700">
          Parent portal access is temporarily unavailable while secure parent sign-in is being implemented.
        </p>
        <p className="mt-3 text-sm text-slate-600">
          Student IDs and registered phone numbers cannot safely verify a parent’s identity. The old
          lookup has been disabled to protect student attendance, fees, receipts and communications.
          Authorized institute staff can use their normal student-management screens.
        </p>
      </div>
    </div>
  );
}
