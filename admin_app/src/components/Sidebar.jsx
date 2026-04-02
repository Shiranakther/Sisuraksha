import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Bus, 
  ShieldAlert, 
  MessageSquareWarning, 
  Wallet, 
  Settings,
  LogOut,
  Menu
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard className="nav-icon" /> },
    { name: 'User Management', path: '/users', icon: <Users className="nav-icon" /> },
    { name: 'Vehicle Management', path: '/vehicles', icon: <Bus className="nav-icon" /> },
    { name: 'Security Management', path: '/security', icon: <ShieldAlert className="nav-icon" /> },
    { name: 'Complaints', path: '/complaints', icon: <MessageSquareWarning className="nav-icon" /> },
    { name: 'Finance', path: '/finance', icon: <Wallet className="nav-icon" /> },
    { name: 'Settings', path: '/settings', icon: <Settings className="nav-icon" /> }
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header" style={{ justifyContent: isCollapsed ? 'center' : 'space-between', padding: isCollapsed ? '24px 0' : '24px' }}>
        {!isCollapsed && <div className="sidebar-logo">Sisuraksha</div>}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)} 
          style={{ background: 'transparent', border: 'none', color: 'var(--sidebar-muted)', cursor: 'pointer', display: 'flex' }}
        >
          <Menu className="nav-icon" />
        </button>
      </div>
      
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink 
            key={item.path} 
            to={item.path} 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            title={isCollapsed ? item.name : ""}
          >
            {item.icon}
            <span>{item.name}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer" style={{ padding: isCollapsed ? '16px 8px' : '16px' }}>
        <button className="logout-btn" onClick={handleLogout} title={isCollapsed ? "Sign Out" : ""}>
          <LogOut className="nav-icon" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
