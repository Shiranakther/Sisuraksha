import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { userApi } from '../api/adminApi';
import { Search, MapPin, Eye, Filter, User, Users, Phone, Mail, X } from 'lucide-react';

const UserManagement = () => {
  const [selectedUser, setSelectedUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      // Let the interceptor handle the authorization token if it is set globally
      const res = await userApi.getAllUsers();
      if (res.data.status === 'success') {
        setUsers(res.data.data);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch user data');
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const term = searchTerm.toLowerCase();
    const fullName = `${user.first_name} ${user.last_name}`.toLowerCase();
    
    const matchesSearch = fullName.includes(term) || 
                          (user.email && user.email.toLowerCase().includes(term)) ||
                          (user.phone_number && user.phone_number.includes(term));
    
    const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-description">Oversee parents and drivers along with their associated data.</p>
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
            placeholder="Search by name, email, or phone..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '14px', color: 'var(--text-main)' }}
          />
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 12px' }}>
          <Filter size={18} color="var(--text-muted)" style={{ marginRight: '8px' }} />
          <select 
            value={roleFilter} 
            onChange={(e) => setRoleFilter(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '14px', color: 'var(--text-main)', cursor: 'pointer' }}
          >
            <option value="ALL">All Roles</option>
            <option value="Driver">Drivers</option>
            <option value="Parent">Parents</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading users...</div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No users found matching the current filters.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ backgroundColor: 'var(--background)', borderBottom: '1px solid var(--border)' }}>
              <tr>
                <th style={{ padding: '16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '13px', textTransform: 'uppercase' }}>User</th>
                <th style={{ padding: '16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '13px', textTransform: 'uppercase' }}>Contact</th>
                <th style={{ padding: '16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '13px', textTransform: 'uppercase' }}>Role</th>
                <th style={{ padding: '16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '13px', textTransform: 'uppercase' }}>Description</th>
                <th style={{ padding: '16px', fontWeight: 600, color: 'var(--text-muted)', fontSize: '13px', textTransform: 'uppercase', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const isDriver = user.role === 'Driver';
                const roleColor = isDriver ? '#f97316' : '#8b5cf6'; // Orange for Driver, Purple for Parent
                const roleBg = isDriver ? '#ffedd5' : '#ede9fe';

                return (
                  <tr key={user.user_id} style={{ borderBottom: '1px solid var(--border)', transition: 'background-color 0.2s', ':hover': { backgroundColor: 'var(--background)' } }}>
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ 
                          width: '40px', height: '40px', borderRadius: '50%', 
                          backgroundColor: roleBg, color: roleColor,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 'bold', fontSize: '16px'
                        }}>
                          {user.first_name?.[0]}{user.last_name?.[0]}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{user.first_name} {user.last_name}</div>
                          {user.address && (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                              <MapPin size={12} /> {user.address.length > 25 ? user.address.substring(0, 25) + '...' : user.address}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontSize: '14px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Mail size={14} color="var(--text-muted)" /> {user.email || 'N/A'}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Phone size={14} color="var(--text-muted)" /> {user.phone_number || 'No Phone'}
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '16px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '20px',
                        backgroundColor: roleBg,
                        color: roleColor,
                        fontSize: '12px',
                        fontWeight: 600,
                        letterSpacing: '0.5px'
                      }}>
                        {isDriver ? <User size={14} /> : <Users size={14} />}
                        {user.role}
                      </span>
                    </td>

                    <td style={{ padding: '16px', fontSize: '14px', color: 'var(--text-muted)' }}>
                      {isDriver ? (
                        <div>
                          <strong>License:</strong> <span style={{ fontFamily: 'monospace' }}>{user.license_number || 'Pending'}</span>
                        </div>
                      ) : (
                        <div>
                          <strong>Children:</strong> {user.children_count || 0} Registered
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <button 
                        onClick={() => setSelectedUser(user)}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border)',
                          padding: '6px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          color: 'var(--text-main)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s',
                        }}
                        title="View Full Profile"
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

      {/* Profile Modal */}
      {selectedUser && createPortal(
        <div style={{
          position: 'fixed',
          top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)',
          zIndex: 9999
        }}>
          <div style={{
            background: 'var(--background)',
            padding: '24px',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '500px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid var(--border)',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '50%',
                  backgroundColor: selectedUser.role === 'Driver' ? '#ffedd5' : '#ede9fe',
                  color: selectedUser.role === 'Driver' ? '#f97316' : '#8b5cf6',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 'bold', fontSize: '20px'
                }}>
                  {selectedUser.first_name?.[0]}{selectedUser.last_name?.[0]}
                </div>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                    {selectedUser.first_name} {selectedUser.last_name}
                  </h2>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{selectedUser.role} Profile</span>
                </div>
              </div>
              <button 
                onClick={() => setSelectedUser(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}
              >
                <X size={24} />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, max-content) 1fr', gap: '10px 16px', fontSize: '14px', alignItems: 'center' }}>
                
                <strong style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}><Mail size={16}/> Email:</strong>
                <span style={{ color: 'var(--text-main)' }}>{selectedUser.email || 'N/A'}</span>
                
                <strong style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}><Phone size={16}/> Phone:</strong>
                <span style={{ color: 'var(--text-main)' }}>{selectedUser.phone_number || 'N/A'}</span>
                
                <strong style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}><MapPin size={16}/> Address:</strong>
                <span style={{ color: 'var(--text-main)' }}>{selectedUser.address || 'N/A'}</span>
                
                <div style={{ gridColumn: '1 / -1', height: '1px', background: 'var(--border)', margin: '8px 0' }}></div>
                
                <strong style={{ color: 'var(--text-muted)' }}>User ID:</strong>
                <span style={{ color: 'var(--text-main)', fontFamily: 'monospace', fontSize: '13px', wordBreak: 'break-all' }}>{selectedUser.user_id}</span>
                
                {selectedUser.role === 'Driver' && (
                  <>
                    <strong style={{ color: 'var(--text-muted)' }}>Driver ID:</strong>
                    <span style={{ color: 'var(--text-main)', fontFamily: 'monospace', fontSize: '13px', wordBreak: 'break-all' }}>{selectedUser.driver_id}</span>
                    <strong style={{ color: 'var(--text-muted)' }}>License No:</strong>
                    <span style={{ color: 'var(--text-main)', fontFamily: 'monospace', fontSize: '13px' }}>{selectedUser.license_number || 'Pending'}</span>
                  </>
                )}
                
                {selectedUser.role === 'Parent' && (
                  <>
                    <strong style={{ color: 'var(--text-muted)' }}>Parent ID:</strong>
                    <span style={{ color: 'var(--text-main)', fontFamily: 'monospace', fontSize: '13px', wordBreak: 'break-all' }}>{selectedUser.parent_id}</span>
                    <strong style={{ color: 'var(--text-muted)' }}>Children Reg:</strong>
                    <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{selectedUser.children_count || 0}</span>
                  </>
                )}
                
                <strong style={{ color: 'var(--text-muted)' }}>Joined:</strong>
                <span style={{ color: 'var(--text-main)' }}>{new Date(selectedUser.created_at).toLocaleDateString()} at {new Date(selectedUser.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
            
            <div style={{ marginTop: '28px', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setSelectedUser(null)}
                style={{
                  background: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  padding: '10px 24px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '14px',
                  boxShadow: '0 4px 6px -1px var(--primary-light)'
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

export default UserManagement;
