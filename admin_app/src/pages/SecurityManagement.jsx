import React, { useState, useEffect } from 'react';
import { blockchainApi } from '../api/adminApi';
import { ShieldAlert, ShieldCheck, ShieldX, RefreshCw, Link2, Search, MapPin, Hash, Clock, User } from 'lucide-react';

const SecurityManagement = () => {
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [verifyingBlockId, setVerifyingBlockId] = useState(null);
  const [verificationResult, setVerificationResult] = useState({});

  const runAudit = async () => {
    setLoading(true);
    setError('');
    try {
      // Axios instance uses token from AuthContext
      const res = await blockchainApi.validate();
      if (res.data.status === 'success') {
        setAuditData(res.data.data);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to run blockchain audit.');
    } finally {
      setLoading(false);
    }
  };

  const verifyEthBlock = async (blockId) => {
    setVerifyingBlockId(blockId);
    try {
      const res = await blockchainApi.verifyBlock(blockId);
      if (res.data) {
        setVerificationResult(prev => ({
            ...prev,
            [blockId]: res.data.data
        }));
      }
    } catch (err) {
      console.error("Failed to verify block on Ethereum", err);
      setVerificationResult(prev => ({
        ...prev,
        [blockId]: { status: 'error', message: 'Verification failed to reach server.' }
      }));
    } finally {
      setVerifyingBlockId(null);
    }
  };

  useEffect(() => {
    runAudit();
  }, []);

  // Filter valid blocks based on search term
  const filteredBlocks = (auditData?.validBlocks || []).filter(block => {
    const term = searchTerm.toLowerCase();
    return (
      (block.childId && block.childId.toLowerCase().includes(term)) ||
      (block.action && block.action.toLowerCase().includes(term)) ||
      (block.hash && block.hash.toLowerCase().includes(term))
    );
  });

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="page-title">Security & Alerts Management</h1>
          <p className="page-description">Real-time alerts, SOS triggers, and blockchain system logs.</p>
        </div>
        <button 
          onClick={runAudit} 
          disabled={loading}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            padding: '10px 16px', 
            backgroundColor: 'var(--primary)', 
            color: '#fff', 
            border: 'none', 
            borderRadius: '6px', 
            cursor: 'pointer',
            fontWeight: 500
          }}
        >
          <RefreshCw className={loading ? 'animate-spin' : ''} size={18} />
          {loading ? 'Running Audit...' : 'Run Blockchain Audit'}
        </button>
      </div>
      
      {error && (
        <div style={{ backgroundColor: 'var(--danger)', color: 'white', padding: '12px', borderRadius: '8px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {/* Blockchain Validation Status Secton */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <ShieldAlert size={20} /> Blockchain Attendance Integrity
        </h3>
        
        {loading && !auditData ? (
          <p style={{ color: 'var(--text-muted)' }}>Running integrity checks across all blocks...</p>
        ) : auditData ? (
          <div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px', 
              padding: '16px', 
              borderRadius: '8px', 
              backgroundColor: auditData.isValid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${auditData.isValid ? 'var(--success)' : 'var(--danger)'}`,
              marginBottom: '20px'
            }}>
              {auditData.isValid ? (
                <ShieldCheck size={32} color="var(--success)" />
              ) : (
                <ShieldX size={32} color="var(--danger)" />
              )}
              
              <div>
                <h4 style={{ 
                  fontSize: '18px', 
                  color: auditData.isValid ? 'var(--success)' : 'var(--danger)',
                  marginBottom: '4px'
                }}>
                  {auditData.isValid ? 'Blockchain Integrity Intact' : 'TAMPERING DETECTED'}
                </h4>
                <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                  Total Blocks Scanned: <strong>{auditData.totalBlocks}</strong>
                </p>
              </div>
            </div>

            {!auditData.isValid && auditData.errors && auditData.errors.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ marginBottom: '12px', fontSize: '15px' }}>Detected Irregularities ({auditData.errors.length})</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {auditData.errors.map((err, idx) => (
                    <div key={idx} style={{ 
                      padding: '12px', 
                      backgroundColor: '#fef2f2', 
                      border: '1px solid #fecaca', 
                      borderRadius: '6px' 
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 600, color: '#991b1b' }}>Block #{err.index} • Type: {err.type}</span>
                        <span style={{ fontSize: '12px', color: '#b91c1c' }}>ID: {err.blockId}</span>
                      </div>
                      <p style={{ color: '#7f1d1d', fontSize: '14px' }}>{err.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '24px 0' }} />

            {/* Blockchain Valid Data / Linked List Explorer */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
                <h3 className="card-title" style={{ margin: 0 }}>Valid Blockchain Records (Immutable)</h3>
                
                {/* Search Bar */}
                <div style={{ display: 'flex', alignItems: 'center', background: 'var(--background)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', width: '300px' }}>
                  <Search size={16} color="var(--text-muted)" style={{ marginRight: '8px' }} />
                  <input 
                    type="text" 
                    placeholder="Search by Child ID, Action, Hash..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '14px', color: 'var(--text-main)' }}
                  />
                </div>
              </div>

              {filteredBlocks.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No valid blocks found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '20px' }}>
                  {filteredBlocks.map((block, index) => (
                    <React.Fragment key={block._id || index}>
                      {/* Line connecting blocks */}
                      {index > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
                          <Link2 size={24} color="var(--text-muted)" style={{ transform: 'rotate(90deg)', opacity: 0.5 }} />
                        </div>
                      )}
                      
                      {/* Block Container */}
                      <div style={{ 
                        border: '1px solid var(--border)', 
                        borderRadius: '8px', 
                        padding: '20px', 
                        background: '#ffffff',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                        transition: 'transform 0.2s',
                        position: 'relative',
                        overflow: 'hidden'
                      }}>
                        {/* Decorative side bar for styling */}
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', backgroundColor: 'var(--primary)' }}></div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                          
                          {/* Left Column: Data */}
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                              <span style={{ 
                                padding: '4px 8px', 
                                backgroundColor: 'rgba(37, 99, 235, 0.1)', 
                                color: 'var(--primary)', 
                                fontSize: '12px', 
                                fontWeight: 600, 
                                borderRadius: '4px',
                                letterSpacing: '0.5px'
                              }}>
                                {block.action || 'UNKNOWN_ACTION'}
                              </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                                <User size={16} color="var(--text-muted)" />
                                <span style={{ color: 'var(--text-muted)' }}>Child ID:</span>
                                <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>{block.childId}</span>
                              </div>
                              
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                                <Clock size={16} color="var(--text-muted)" />
                                <span style={{ color: 'var(--text-muted)' }}>Timestamp:</span>
                                <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>
                                  {new Date(block.timestamp).toLocaleString()}
                                </span>
                              </div>

                              {(block.location?.lat || block.location?.lon) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                                  <MapPin size={16} color="var(--text-muted)" />
                                  <span style={{ color: 'var(--text-muted)' }}>Location:</span>
                                  <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>
                                    {block.location.lat}, {block.location.lon}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Right Column: Hashes */}
                          <div style={{ 
                            backgroundColor: 'var(--background)', 
                            padding: '12px', 
                            borderRadius: '6px', 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '12px',
                            border: '1px dashed var(--border)'
                          }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                <Hash size={14} color="var(--text-muted)" />
                                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Current Hash</span>
                              </div>
                              <div style={{ 
                                wordBreak: 'break-all', 
                                fontSize: '13px', 
                                fontFamily: 'monospace', 
                                color: 'var(--text-main)',
                                backgroundColor: '#fff',
                                padding: '6px',
                                borderRadius: '4px',
                                border: '1px solid var(--border)'
                              }}>
                                {block.hash}
                              </div>
                            </div>

                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                <Link2 size={14} color="var(--text-muted)" />
                                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Previous Link</span>
                              </div>
                              <div style={{ 
                                wordBreak: 'break-all', 
                                fontSize: '13px', 
                                fontFamily: 'monospace', 
                                color: 'var(--text-muted)',
                                backgroundColor: '#fff',
                                padding: '6px',
                                borderRadius: '4px',
                                border: '1px solid var(--border)'
                              }}>
                                {block.previousHash}
                              </div>
                            </div>

                            {/* Ethereum Verification Section */}
                            <div style={{ marginTop: '8px' }}>
                              {!verificationResult[block._id] ? (
                                <button
                                  onClick={() => verifyEthBlock(block._id)}
                                  disabled={verifyingBlockId === block._id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    backgroundColor: 'var(--primary)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: verifyingBlockId === block._id ? 'not-allowed' : 'pointer',
                                    opacity: verifyingBlockId === block._id ? 0.7 : 1
                                  }}
                                >
                                  {verifyingBlockId === block._id ? <RefreshCw className="animate-spin" size={14} /> : <ShieldCheck size={14} />}
                                  {verifyingBlockId === block._id ? 'Verifying...' : 'Verify on Ethereum'}
                                </button>
                              ) : (
                                <div style={{
                                  padding: '8px',
                                  fontSize: '12px',
                                  borderRadius: '4px',
                                  backgroundColor: verificationResult[block._id].status === 'success' ? '#dcfce7' : 
                                                 verificationResult[block._id].status === 'pending' ? '#fef9c3' : '#fee2e2',
                                  color: verificationResult[block._id].status === 'success' ? '#166534' : 
                                         verificationResult[block._id].status === 'pending' ? '#854d0e' : '#991b1b',
                                  border: `1px solid ${verificationResult[block._id].status === 'success' ? '#bbf7d0' : 
                                                    verificationResult[block._id].status === 'pending' ? '#fef08a' : '#fecaca'}`
                                }}>
                                  <strong>ETH Status:</strong> {verificationResult[block._id].message}
                                </div>
                              )}
                            </div>

                          </div>
                          
                        </div>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>

          </div>
        ) : null}
      </div>
    </div>
  );
};

export default SecurityManagement;
