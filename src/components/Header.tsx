import React, { useState } from 'react';
import { CONTRACT_ADDRESS } from '../contracts/config';
import { WalletIncomeNotifier } from './WalletIncomeNotifier';
import { FractalFlowBrandCard } from './FractalFlowLogo';
import {
  Wallet,
  AlertTriangle,
  RefreshCw,
  LogOut,
  Shield,
  Trash2,
  Sun,
  Moon,
  Zap,
  LayoutDashboard,
} from 'lucide-react';

interface HeaderProps {
  account: string | null;
  chainId: number | null;
  isBscTestnet: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onSwitchNetwork: () => void;
  onRefresh: () => void;
  language: 'th' | 'en';
  onToggleLanguage: () => void;
  onOpenDeployModal: () => void;
  contractAddress?: string;
  isAdminUser?: boolean;
  isAdminView?: boolean;
  onToggleAdminView?: () => void;
  isDashboard2View?: boolean;
  onToggleDashboard2?: () => void;
  onClearCache?: () => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  account,
  isBscTestnet,
  isConnecting,
  onConnect,
  onDisconnect,
  onSwitchNetwork,
  onRefresh,
  language,
  onToggleLanguage,
  onOpenDeployModal,
  contractAddress,
  isAdminUser = false,
  isAdminView = false,
  onToggleAdminView,
  isDashboard2View = false,
  onToggleDashboard2,
  onClearCache,
  theme = 'light',
  onToggleTheme,
}) => {
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [clearSuccessMsg, setClearSuccessMsg] = useState<string | null>(null);

  const handleClearCache = async () => {
    if (isClearingCache) return;
    setIsClearingCache(true);
    setClearSuccessMsg(null);
    try {
      if (typeof window !== 'undefined') {
        try {
          const keysToRemove: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (
              k &&
              (k.toLowerCase().includes('matrix') ||
                k.toLowerCase().includes('tree') ||
                k.toLowerCase().includes('cache') ||
                k.toLowerCase().includes('f27_build'))
            ) {
              keysToRemove.push(k);
            }
          }
          keysToRemove.forEach((k) => localStorage.removeItem(k));
          sessionStorage.clear();
        } catch {
          // ignore
        }
      }

      await fetch('/api/matrix/clear-cache', { method: 'POST' }).catch(() => {});
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('matrix:tree:refresh'));
      }
      onRefresh();
      if (onClearCache) {
        onClearCache();
      }

      setClearSuccessMsg(
        language === 'th' ? 'ล้างแคชสำเร็จ!' : 'Cache cleared!'
      );
      setTimeout(() => setClearSuccessMsg(null), 3000);
    } finally {
      setTimeout(() => setIsClearingCache(false), 600);
    }
  };
  const shortAddress = account
    ? `${account.substring(0, 6)}...${account.substring(account.length - 4)}`
    : '';

  return (
    <header className="w-full bg-[radial-gradient(ellipse_at_85%_90%,rgba(71,225,255,0.35),transparent_42%),linear-gradient(120deg,#04236b,#075ed0_60%,#031d61)] dark:bg-[linear-gradient(120deg,#021238,#062b78_60%,#021030)] border-b border-[#42bfff]/50 shadow-[0_6px_22px_rgba(0,60,155,0.35)] text-white sticky top-0 z-40">
      <div className="max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 py-2.5 sm:py-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
          {/* Brand Lockup */}
          <div className="min-w-0">
            <FractalFlowBrandCard size="sm" />
          </div>

          {/* Right Controls: [Theme] [Clear Cache] [Refresh] [Member Home] [Language] + Admin (if admin) + Wallet/Exit */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                className="px-2.5 py-1.5 rounded-xl bg-slate-950/35 hover:bg-slate-950/55 border border-cyan-300/35 text-white text-[11px] sm:text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer shrink-0"
                title={theme === 'light' ? 'สลับเป็นโหมดมืด (Dark Mode)' : 'สลับเป็นโหมดสว่าง (Light Mode)'}
              >
                {theme === 'light' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-300" />
                    <span>{language === 'th' ? 'สว่าง' : 'Light'}</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-cyan-200" />
                    <span>{language === 'th' ? 'มืด' : 'Dark'}</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={handleClearCache}
              disabled={isClearingCache}
              className="p-2 rounded-xl bg-rose-500/25 hover:bg-rose-500/40 border border-rose-300/45 text-rose-100 transition cursor-pointer disabled:opacity-50 shrink-0"
              title={clearSuccessMsg || (language === 'th' ? 'ล้างแคช' : 'Clear Cache')}
            >
              <Trash2 className={`w-3.5 h-3.5 ${isClearingCache ? 'animate-spin' : ''}`} />
            </button>

            {account && (
              <button
                onClick={onRefresh}
                className="p-2 rounded-xl bg-white/15 hover:bg-white/25 border border-cyan-300/40 text-white transition cursor-pointer shrink-0"
                title={language === 'th' ? 'รีเฟรชข้อมูลบล็อกเชน' : 'Refresh blockchain data'}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}

            {onToggleDashboard2 && (
              <button
                type="button"
                onClick={onToggleDashboard2}
                className={`text-[11px] sm:text-xs px-3 py-1.5 rounded-xl font-extrabold transition duration-200 inline-flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0 cursor-pointer ${
                  isDashboard2View
                    ? 'bg-white/15 hover:bg-white/25 text-white border border-cyan-300/45'
                    : 'bg-gradient-to-r from-[#22caff] to-[#0758d4] hover:brightness-110 text-white border border-[#72e5ff]/70 shadow-[0_4px_14px_rgba(8,124,244,0.45)]'
                }`}
                title={
                  language === 'th'
                    ? isDashboard2View
                      ? 'เปิดหน้าผัง Matrix เต็มจอ'
                      : 'กลับหน้าหลักสมาชิก'
                    : isDashboard2View
                    ? 'Open Full Matrix Tree'
                    : 'Back to Member Home'
                }
              >
                <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isDashboard2View
                    ? language === 'th'
                      ? 'ผัง Matrix'
                      : 'Matrix'
                    : language === 'th'
                    ? 'หน้าหลักสมาชิก'
                    : 'Member Home'}
                </span>
              </button>
            )}

            <button
              onClick={onToggleLanguage}
              className="text-[11px] sm:text-xs bg-white/15 hover:bg-white/25 border border-cyan-300/35 px-2.5 py-1.5 rounded-xl font-mono font-semibold text-white transition whitespace-nowrap shrink-0 cursor-pointer"
            >
              {language === 'th' ? '🇬🇧 EN' : '🇹🇭 TH'}
            </button>

            {/* Deploy Smart Contract Button (Visible ONLY to Admin) */}
            {isAdminUser && (
              <button
                type="button"
                onClick={onOpenDeployModal}
                className="text-[11px] sm:text-xs px-2.5 py-1.5 rounded-xl font-bold transition duration-200 inline-flex items-center gap-1 shadow-sm whitespace-nowrap shrink-0 cursor-pointer bg-emerald-500/30 hover:bg-emerald-500/45 border border-emerald-300/50 text-emerald-50"
                title={language === 'th' ? 'Deploy Smart Contract ใหม่ (เฉพาะแอดมิน)' : 'Deploy Smart Contract (Admin only)'}
              >
                <Zap className="w-3.5 h-3.5 shrink-0" />
                <span>{language === 'th' ? 'Deploy สัญญา' : 'Deploy Contract'}</span>
              </button>
            )}

            {/* Admin Control Center Toggle Button (Visible ONLY to Admin) */}
            {isAdminUser && onToggleAdminView && (
              <button
                type="button"
                onClick={onToggleAdminView}
                className={`text-[11px] sm:text-xs px-2.5 py-1.5 rounded-xl font-bold transition duration-200 inline-flex items-center gap-1 shadow-sm whitespace-nowrap shrink-0 cursor-pointer ${
                  isAdminView
                    ? 'bg-amber-400 text-[#09265f] border border-amber-200'
                    : 'bg-amber-400/25 hover:bg-amber-400/40 border border-amber-300/50 text-amber-100'
                }`}
              >
                <Shield className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isAdminView
                    ? language === 'th'
                      ? 'กลับหน้าผัง'
                      : 'Matrix'
                    : language === 'th'
                    ? 'Admin'
                    : 'Admin'}
                </span>
              </button>
            )}

            {/* Switch Network Button (Only shown if connected to wrong network) */}
            {account && !isBscTestnet && (
              <button
                onClick={onSwitchNetwork}
                className="inline-flex items-center gap-1 bg-amber-400 hover:bg-amber-300 border border-amber-200 text-[#09265f] px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold transition whitespace-nowrap shrink-0 cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{language === 'th' ? 'สลับเครือข่าย' : 'Switch Net'}</span>
              </button>
            )}

            {/* Wallet Income & Latest Transaction Alert Center (Floating Bell) */}
            <WalletIncomeNotifier
              account={account}
              language={language}
              theme={theme}
              onRefresh={onRefresh}
            />

            {/* Connect / Disconnect Button */}
            {account ? (
              <div className="inline-flex items-center gap-2 bg-slate-950/60 border border-cyan-300/35 px-2.5 sm:px-3 py-1.5 rounded-xl shadow-sm shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-[11px] sm:text-xs font-mono font-semibold text-white whitespace-nowrap">
                  {shortAddress}
                </span>
                <button
                  onClick={onDisconnect}
                  className="inline-flex items-center gap-1 text-[11px] text-rose-300 hover:text-rose-200 font-bold transition pl-1.5 border-l border-white/20 whitespace-nowrap cursor-pointer"
                  title={language === 'th' ? 'ตัดการเชื่อมต่อกระเป๋า' : 'Disconnect Wallet'}
                >
                  <LogOut className="w-3 h-3 sm:hidden" />
                  <span>{language === 'th' ? 'ออก' : 'Exit'}</span>
                </button>
              </div>
            ) : (
              <button
                onClick={onConnect}
                disabled={isConnecting}
                id="walletBtn"
                className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-xl transition duration-200 shadow-sm cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Wallet className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {isConnecting
                    ? language === 'th'
                      ? 'กำลังเชื่อมต่อ...'
                      : 'Connecting...'
                    : language === 'th'
                    ? 'เชื่อมต่อกระเป๋า'
                    : 'Connect Wallet'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
