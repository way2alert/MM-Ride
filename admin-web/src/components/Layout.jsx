import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import NotificationBanner from './NotificationBanner';

export default function Layout({ currentTab, setTab, title, subtitle, children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="app-container">
      <Sidebar 
        currentTab={currentTab} 
        setTab={setTab} 
        mobileOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />
      <div className="main-wrapper">
        <NotificationBanner setTab={setTab} />
        <Header 
          title={title} 
          subtitle={subtitle} 
          setTab={setTab} 
          onMenuToggle={() => setMobileMenuOpen(prev => !prev)}
        />
        <main className="content-body">
          {children}
        </main>
      </div>
    </div>
  );
}
