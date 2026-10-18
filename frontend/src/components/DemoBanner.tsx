import React from 'react';

export const DemoBanner: React.FC = () => {
  return (
    <div className="demo-banner" role="region" aria-label="Demo environment notification">
      <span>⚠️</span>
      <span>
        <strong>PILOT DEMONSTRATION ENVIRONMENT:</strong> Operating with synthetic demo data. Doorstep cash collection is deactivated. Online payments execute in mock sandbox mode (no real money deducted).
      </span>
    </div>
  );
};
