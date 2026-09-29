import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import NotificationBanner from './NotificationBanner';

export default function Layout({ currentTab, setTab, title, subtitle, children }) {
  return (
    <div className="app-container">
      <Sidebar currentTab={currentTab} setTab={setTab} />
      <div className="main-wrapper">
        <NotificationBanner setTab={setTab} />
        <Header title={title} subtitle={subtitle} setTab={setTab} />
        <main className="content-body">
          {children}
        </main>
      </div>
    </div>
  );
}
