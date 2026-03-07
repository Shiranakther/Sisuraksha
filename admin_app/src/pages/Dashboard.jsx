import React from 'react';

const Dashboard = () => {
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Dashboard Overview</h1>
        <p className="page-description">High-level summary of the entire Sisuraksha ecosystem.</p>
      </div>
      
      <div className="dashboard-grid">
        <div className="card">
          <h3 className="card-title">Total Active Parents</h3>
          <div className="card-value">1,450</div>
        </div>
        <div className="card">
          <h3 className="card-title">Active Drivers</h3>
          <div className="card-value">124</div>
        </div>
        <div className="card">
          <h3 className="card-title">Vehicles in Fleet</h3>
          <div className="card-value">85</div>
        </div>
        <div className="card">
          <h3 className="card-title">Ongoing Trips</h3>
          <div className="card-value">32</div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
