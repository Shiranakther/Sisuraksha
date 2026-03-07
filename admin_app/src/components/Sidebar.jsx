import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Bus, 
  ShieldAlert, 
  MessageSquareWarning, 
  Wallet, 
  Settings,
  LogOut
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

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
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">Sisuraksha</div>
      </div>
      
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink 
            key={item.path} 
            to={item.path} 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            {item.icon}
            {item.name}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="logout-btn" onClick={handleLogout}>
          <LogOut className="nav-icon" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
