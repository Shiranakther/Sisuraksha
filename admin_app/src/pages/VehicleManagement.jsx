import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { vehicleApi } from '../api/adminApi';
import { Search, MapPin, Eye, Filter, Bus, CheckCircle2, XCircle, Phone, Mail, X, Check, Activity, Shield } from 'lucide-react';

const VehicleManagement = () => {
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusLoading, setStatusLoading] = useState(null); // Track which toggle is loading
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    fetchVehicles();
  }, []);

  const fetchVehicles = async () => {
    try {
      setLoading(true);
      const res = await vehicleApi.getAllVehicles();
      if (res.data.status === 'success') {
        setVehicles(res.data.data);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch vehicle data');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id, field, currentValue) => {
    setStatusLoading(`${id}-${field}`);
    try {
      const res = await vehicleApi.toggleStatus(id, field, !currentValue);
      if (res.data.status === 'success') {
        setVehicles(prevVehicles => 
          prevVehicles.map(v => v.vehicle_id === id ? { ...v, [field]: !currentValue } : v)
        );
        // Also update the selected vehicle if it's currently open in the modal
        if (selectedVehicle && selectedVehicle.vehicle_id === id) {
          setSelectedVehicle(prev => ({ ...prev, [field]: !currentValue }));
        }
      }
    } catch (err) {
      console.error(err);
      alert(`Failed to update vehicle status: ${err.message}`);
    } finally {
      setStatusLoading(null);
    }
  };

  const filteredVehicles = vehicles.filter(v => {
    const term = searchTerm.toLowerCase();
    const driverName = `${v.driver_first_name} ${v.driver_last_name}`.toLowerCase();
    
    const matchesSearch = v.vehicle_number.toLowerCase().includes(term) || 
                          driverName.includes(term) ||
                          (v.driver_email && v.driver_email.toLowerCase().includes(term));
    
    let matchesStatus = true;
    if (statusFilter === 'ACTIVE') matchesStatus = v.is_active;
    if (statusFilter === 'INACTIVE') matchesStatus = !v.is_active;
    if (statusFilter === 'VERIFIED') matchesStatus = v.is_verified;
    if (statusFilter === 'UNVERIFIED') matchesStatus = !v.is_verified;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="page-title">Vehicle Management</h1>
          <p className="page-description">Manage transportation assets, verify documents, and activate bus modules here.</p>
        </div>
      </div>

      {error && (
        <div style={{ backgroundColor: 'var(--danger)', color: 'white', padding: '12px', borderRadius: '8px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {/* Controls: Search and Filter */}
      <div className="card" style={{ marginBottom: '24px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', flex: 1, minWidth: '250px', alignItems: 'center', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 12px' }}>
          <Search size={18} color="var(--text-muted)" style={{ marginRight: '8px' }} />
          <input 
            type="text" 
            placeholder="Search by license plate or driver..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '14px', color: 'var(--text-main)' }}
          />
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 12px' }}>
          <Filter size={18} color="var(--text-muted)" style={{ marginRight: '8px' }} />
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '14px', color: 'var(--text-main)', cursor: 'pointer' }}
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Buses</option>
            <option value="INACTIVE">Inactive Buses</option>
            <option value="VERIFIED">Verified Drivers</option>
            <option value="UNVERIFIED">Unverified Drivers</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading vehicles...</div>
        ) : filteredVehicles.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No vehicles found matching the current filters.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: 'var(--background)', borderBottom: '1px solid var(--border)' }}>
              <tr>
                <th style={{ padding: '16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '13px', textTransform: 'uppercase' }}>Vehicle Plate</th>
                <th style={{ padding: '16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '13px', textTransform: 'uppercase' }}>Assigned Driver</th>
                <th style={{ padding: '16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '13px', textTransform: 'uppercase' }}>Verified Status</th>
                <th style={{ padding: '16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '13px', textTransform: 'uppercase' }}>Active Status</th>
                <th style={{ padding: '16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '13px', textTransform: 'uppercase', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.map((v) => {

                // Using Blue theme for the vehicles to distinguish from strictly Drivers(Orange) & Parents(Purple).
                const plateColor = '#2563eb'; // Deep Blue
                const plateBg = '#dbeafe';

                return (
                  <tr key={v.vehicle_id} style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.2s', ':hover': { backgroundColor: 'var(--background)' } }}>
                    
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ 
                          width: '40px', height: '40px', borderRadius: '8px', 
                          backgroundColor: plateBg, color: plateColor,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Bus size={20} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '16px', color: 'var(--text-main)' }}>{v.vehicle_number}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                            Capacity: {v.capacity || 'N/A'} Seats
                          </div>
                        </div>
                      </div>
                    </td>
                    
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '14px' }}>
                          {v.driver_first_name} {v.driver_last_name}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                           {v.driver_phone || v.driver_email || 'No Contact'}
                        </div>
                      </div>
                    </td>

                    {/* verification toggle */}
                    <td style={{ padding: '16px' }}>
                      <button 
                        disabled={statusLoading === `${v.vehicle_id}-is_verified`}
                        onClick={() => handleToggle(v.vehicle_id, 'is_verified', v.is_verified)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          padding: '6px 12px', borderRadius: '20px',
                          backgroundColor: v.is_verified ? '#dcfce7' : '#fee2e2',
                          color: v.is_verified ? '#16a34a' : '#ef4444',
                          border: `1px solid ${v.is_verified ? '#bbf7d0' : '#fecaca'}`,
                          cursor: 'pointer', fontSize: '12px', fontWeight: 600
                        }}
                      >
                         {v.is_verified ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                         {v.is_verified ? 'Verified' : 'Unverified'}
                      </button>
                    </td>

                    {/* active toggle */}
                    <td style={{ padding: '16px' }}>
                      <button 
                        disabled={statusLoading === `${v.vehicle_id}-is_active`}
                        onClick={() => handleToggle(v.vehicle_id, 'is_active', v.is_active)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          padding: '6px 12px', borderRadius: '20px',
                          backgroundColor: v.is_active ? '#dbeafe' : '#f1f5f9',
                          color: v.is_active ? '#2563eb' : '#64748b',
                          border: `1px solid ${v.is_active ? '#bfdbfe' : '#e2e8f0'}`,
                          cursor: 'pointer', fontSize: '12px', fontWeight: 600
                        }}
                      >
                         {v.is_active ? <Check size={14} /> : <X size={14} />}
                         {v.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>

                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <button 
                        onClick={() => setSelectedVehicle(v)}
                        style={{
                          background: 'transparent', border: '1px solid var(--border)',
                          padding: '6px', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-main)'
                        }}
                        title="View Full Vehicle Details"
                      >
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Vehicle Details Modal */}
      {selectedVehicle && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)', zIndex: 9999
        }}>
          <div style={{
            background: 'var(--background)', padding: '24px', borderRadius: '12px', width: '90%', maxWidth: '500px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', border: '1px solid var(--border)', animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '10px',
                  backgroundColor: '#dbeafe', color: '#2563eb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Bus size={24} />
                </div>
                <div>
                  <h2 style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-main)', margin: 0 }}>
                    {selectedVehicle.vehicle_number}
                  </h2>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Registered Vehicle Profile</span>
                </div>
              </div>
              <button onClick={() => setSelectedVehicle(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
                <X size={24} />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, max-content) 1fr', gap: '12px 16px', fontSize: '14px', alignItems: 'center' }}>
                
                <h4 style={{ gridColumn: '1 / -1', margin: '8px 0 0 0', color: 'var(--text-main)' }}>Assigned Driver Details</h4>

                <strong style={{ color: 'var(--text-muted)' }}>Driver Name:</strong>
                <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{selectedVehicle.driver_first_name} {selectedVehicle.driver_last_name}</span>

                <strong style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}><Mail size={16}/> Email:</strong>
                <span style={{ color: 'var(--text-main)' }}>{selectedVehicle.driver_email || 'N/A'}</span>
                
                <strong style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}><Phone size={16}/> Phone:</strong>
                <span style={{ color: 'var(--text-main)' }}>{selectedVehicle.driver_phone || 'N/A'}</span>

                <strong style={{ color: 'var(--text-muted)' }}>License No:</strong>
                <span style={{ color: 'var(--text-main)', fontFamily: 'monospace' }}>{selectedVehicle.license_number || 'N/A'}</span>
                
                <div style={{ gridColumn: '1 / -1', height: '1px', background: 'var(--border)', margin: '8px 0' }}></div>
                
                <h4 style={{ gridColumn: '1 / -1', margin: '4px 0 0 0', color: 'var(--text-main)' }}>Registration Settings</h4>

                <strong style={{ color: 'var(--text-muted)' }}>Maximum Capacity:</strong>
                <span style={{ color: 'var(--text-main)' }}>{selectedVehicle.capacity} Students</span>

                <strong style={{ color: 'var(--text-muted)' }}>Database IDs:</strong>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'monospace' }}>
                   v:{selectedVehicle.vehicle_id} | d:{selectedVehicle.driver_id}
                </span>

                <strong style={{ color: 'var(--text-muted)' }}>Added Date:</strong>
                <span style={{ color: 'var(--text-main)' }}>{new Date(selectedVehicle.created_at).toLocaleDateString()}</span>
              </div>
            </div>
            
            <div style={{ marginTop: '28px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setSelectedVehicle(null)}
                style={{
                  background: 'var(--primary)', color: 'white', border: 'none',
                  padding: '10px 24px', borderRadius: '6px', cursor: 'pointer',
                  fontWeight: 600, fontSize: '14px', boxShadow: '0 4px 6px -1px var(--primary-light)'
                }}
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default VehicleManagement;
