import React from 'react';

const Settings = () => {
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1 className="page-title">Platform Settings</h1>
        <p className="page-description">Configure global application variables and APIs.</p>
      </div>
      
      <div className="card">
        <h3>Configurations</h3>
        <p>Change notification thresholds, database connections, and integrations.</p>
      </div>
    </div>
  );
};

export default Settings;
