import React from 'react';

const VehicleManagement = () => {
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Vehicle Management</h1>
        <p className="page-description">Manage transportation assets, maintenance, and routes.</p>
      </div>
      
      <div className="card">
        <h3>Registered Vehicles</h3>
        <p>List of buses, their assigned drivers, and active routes will be shown here.</p>
      </div>
    </div>
  );
};

export default VehicleManagement;
