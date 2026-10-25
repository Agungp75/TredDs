import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MarketProvider } from './context/MarketContext';
import { AIProvider } from './context/AIContext';
import Navbar from './components/common/Navbar';
import DisclaimerFooter from './components/common/DisclaimerFooter';
import AISettingsModal from './components/common/AISettingsModal';
import HomeDashboard from './pages/HomeDashboard';
import CryptoDashboard from './pages/CryptoDashboard';
import AssetDetail from './pages/AssetDetail';

export default function App() {
  return (
    <MarketProvider>
      <AIProvider>
        <BrowserRouter>
          <div className="min-h-screen flex flex-col bg-background font-body text-on-surface antialiased selection:bg-primary-container selection:text-on-primary-container">
            <Navbar />
            <AISettingsModal />
            <main className="w-full pt-28 pb-16 bg-background flex-1 px-4 sm:px-6 xl:px-10">
              <Routes>
                <Route path="/" element={<HomeDashboard />} />
                <Route path="/crypto" element={<CryptoDashboard />} />
                <Route path="/analysis/:symbol" element={<AssetDetail />} />
                <Route path="/analysis" element={<Navigate to="/analysis/BTC_USDT" replace />} />
                <Route path="/forex" element={<Navigate to="/" replace />} />
                <Route path="/stocks" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <DisclaimerFooter />
          </div>
        </BrowserRouter>
      </AIProvider>
    </MarketProvider>
  );
}
