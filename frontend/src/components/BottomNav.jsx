import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Search, Heart, MessageSquare, User } from 'lucide-react';
import { isAuthenticated, getChatUnreadCount } from '../services/api';
import './BottomNav.css';

const BottomNav = () => {
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const location = useLocation();

  const isAuth = isAuthenticated();
  const isLandingPage = !isAuth || location.pathname === '/' || location.pathname === '/login' || location.pathname === '/register';

  useEffect(() => {
    let timeoutId;
    let isMounted = true;

    const fetchChatCount = async () => {
      try {
        if (isAuth && !isLandingPage) {
          const { unreadCount } = await getChatUnreadCount();
          if (isMounted) setUnreadChatCount(unreadCount || 0);
        }
      } catch (error) {
        console.error('Error fetching unread chat count in BottomNav:', error);
      } finally {
        if (isMounted && isAuth && !isLandingPage) {
          timeoutId = setTimeout(fetchChatCount, 3000);
        }
      }
    };

    if (isAuth && !isLandingPage) {
      fetchChatCount();
    }

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isAuth, isLandingPage]);

  if (isLandingPage) {
    return null;
  }

  const navItems = [
    { path: '/home', label: 'Home', icon: Home },
    { path: '/matches', label: 'Matches', icon: Heart },
    { path: '/search', label: 'Search', icon: Search },
    { 
      path: '/chat', 
      label: 'Chat', 
      icon: MessageSquare,
      badge: unreadChatCount 
    },
    { path: '/profile', label: 'Profile', icon: User }
  ];

  return (
    <nav className="mobile-bottom-nav">
      <div className="bottom-nav-container">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
            >
              <div className="icon-wrapper">
                <Icon size={22} className="nav-icon" />
                {item.badge > 0 && (
                  <span className="bottom-nav-badge">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className="bottom-nav-label">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
