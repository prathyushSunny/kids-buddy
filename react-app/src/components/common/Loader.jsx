import React from 'react';

export default function Loader() {
  return (
    <div className="page-loader">
      <div className="app-loader">
        <img className="app-loader-icon" src="/app-icon.png" alt="" />
        <div className="app-loader-ring" />
      </div>
    </div>
  );
}
