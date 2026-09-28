import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout({ currentTab, setTab, title, subtitle, children }) {
  return (
    <div className="app-container">
      <Sidebar currentTab={currentTab} setTab={setTab} />
      <div className="main-wrapper">
        <Header title={title} subtitle={subtitle} />
        <main className="content-body">
          {children}
        </main>
      </div>
    </div>
  );
}
