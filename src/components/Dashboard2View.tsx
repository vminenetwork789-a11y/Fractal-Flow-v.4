import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ethers } from 'ethers';
import {
  RANK_PRICES_USDT,
  CONTRACT_ADDRESS,
  MATRIX_ABI,
  SUPPORTED_NETWORKS,
} from '../contracts/config';
import { calculateMainIdVaultPools } from '../utils/vaultPools';
import { buildReferralLink } from '../utils/referralLink';
import {
  peekPostTxViewTarget,
  POST_TX_VIEW_EVENT,
  type PostTxViewTarget,
} from '../utils/postTxNotice';
import { FractalFlowBrandCard } from './FractalFlowLogo';
import {
  RefreshCw,
  Check,
  Copy,
  X,
  ArrowUpRight,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Wallet,
  Sun,
  Moon,
  Search,
  Calendar,
  Clock,
  Trash2,
  Shield,
  Zap,
  LogOut,
  LayoutGrid,
  UserPlus,
  ChevronDown,
} from 'lucide-react';
import { Dashboard2MatrixPanel, type MatrixActiveIdSummary } from './Dashboard2MatrixPanel';
import { Dashboard2UnilevelPanel } from './Dashboard2UnilevelPanel';
import { Dashboard2IdVaultPanel } from './Dashboard2IdVaultPanel';
import { WalletIncomeNotifier } from './WalletIncomeNotifier';

async function safeReadJson(res: Response | null): Promise<any> {
  if (!res || !res.ok) return null;
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return null;
  }
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function deriveSourceStatusInfo(fromNodeType?: string, fromNodeId?: number, fromMainId?: number, rank?: number) {
  const raw = String(fromNodeType || '').trim();
  const statusTh = raw.startsWith('โคลน')
    ? 'Clone ID (โคลนนิ่ง)'
    : raw.startsWith('Extra')
    ? 'Extra ID'
    : raw.startsWith('Auto ID')
    ? 'Auto ID'
    : 'Main ID';
  const idLabel =
    raw ||
    (fromMainId && fromNodeId && fromMainId !== fromNodeId
      ? `Main #${fromMainId} (R${rank || 1}-#${fromNodeId})`
      : fromNodeId
      ? `Main #${fromMainId || fromNodeId} (R${rank || 1}-#${fromNodeId})`
      : '');
  return { statusTh, idLabel };
}

interface Dashboard2ViewProps {
  language: 'th' | 'en';
  theme: 'light' | 'dark';
  onToggleLanguage: () => void;
  onToggleTheme: () => void;
  account: string | null;
  chainId: number | null;
  isBscTestnet: boolean;
  usdtBalance: string;
  bnbBalance: string;
  allowance: string;
  contractAddress: string;
  profile: any;
  selectedMainId: string;
  onSelectMainId: (mainId: string) => void;
  onOpenMatrixTree: (targetRank?: number) => void;
  onOpenRegisterModal: (sponsorId?: number | null) => void;
  onOpenContractSwitcher: () => void;
  onConnectWallet: () => void;
  onDisconnect?: () => void;
  onSwitchNetwork: () => void;
  onRefreshOnChainData?: () => void;
  onApproveUsdt: (amountUsdt?: number) => Promise<any>;
  onUpgradeToRank: (targetRank: number, targetMainId?: number | string) => Promise<any>;
  isAdminUser?: boolean;
  onOpenDeployModal?: () => void;
  onToggleAdminView?: () => void;
  isLoadingTx?: boolean;
  refreshTrigger?: any;
}

type BottomTabKey = 'home' | 'matrix' | 'unilevel' | 'id_vault' | 'history';

const shouldAutoOpenMatrixTarget = (t?: PostTxViewTarget | null): boolean =>
  Boolean(t && (t.type === 'register' || t.type === 'upgrade' || t.type === 'admin_upgrade'));
type DetailModalKey =
  | null
  | 'switch_id'
  | 'members'
  | 'ranks_18'
  | 'upgrade'
  | 'wallet'
  | 'vault'
  | 'allsell'
  | 'income';

const ALLSELL_DIRECT_REQUIREMENTS: Record<
  number,
  { label: string; count: number; rangeText: string }
> = {
  11: { label: '5 IDs (R8–11)', count: 5, rangeText: 'r-8 ถึง r-11' },
  14: { label: '2 IDs (R12–14)', count: 2, rangeText: 'r-12 ถึง r-14' },
  16: { label: '2 IDs (R14–16)', count: 2, rangeText: 'r-14 ถึง r-16' },
  18: { label: '5 IDs (R16–18)', count: 5, rangeText: 'r-16 ถึง r-18' },
};

const isRealChainTxHash = (hash?: string): boolean => {
  if (!hash) return false;
  const h = String(hash).trim();
  return /^0x[0-9a-fA-F]{64}$/.test(h) && !/^0x(up|0{8,}|auto|extra|rew)/i.test(h);
};

const formatThaiDateTime = (ts?: string): string => {
  if (!ts) return '-';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
};

const toLocalDateTimeInput = (d: Date): string => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

const SvgProgressBar: React.FC<{
  percent: number;
  variant?: 'sky' | 'gold' | 'emerald' | 'purple';
  heightClass?: string;
  trackClass?: string;
}> = ({
  percent,
  variant = 'sky',
  heightClass = 'h-2.5',
  trackClass = 'bg-[#9ccdf1]',
}) => {
  const safePct = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const fillColor =
    variant === 'gold'
      ? 'url(#d2GoldGrad)'
      : variant === 'emerald'
      ? 'url(#d2EmeraldGrad)'
      : variant === 'purple'
      ? 'url(#d2PurpleGrad)'
      : 'url(#d2SkyGrad)';

  return (
    <div
      className={`w-full ${heightClass} rounded-full overflow-hidden ${trackClass}`}
      role="progressbar"
      aria-valuenow={Math.round(safePct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="w-full h-full block">
        <defs>
          <linearGradient id="d2SkyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#087cf4" />
            <stop offset="100%" stopColor="#54dfff" />
          </linearGradient>
          <linearGradient id="d2GoldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ffc52e" />
            <stop offset="100%" stopColor="#fff18b" />
          </linearGradient>
          <linearGradient id="d2EmeraldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#059669" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
          <linearGradient id="d2PurpleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>
        </defs>
        {safePct > 0 && <rect x="0" y="0" width={safePct} height="10" rx="5" fill={fillColor} />}
      </svg>
    </div>
  );
};

export const Dashboard2View: React.FC<Dashboard2ViewProps> = ({
  language,
  theme,
  onToggleLanguage,
  onToggleTheme,
  account,
  usdtBalance,
  bnbBalance,
  allowance,
  contractAddress,
  profile,
  selectedMainId,
  onSelectMainId,
  onOpenMatrixTree,
  onOpenRegisterModal,
  onConnectWallet,
  onDisconnect,
  onRefreshOnChainData,
  onApproveUsdt,
  onUpgradeToRank,
  isAdminUser = false,
  onOpenDeployModal,
  onToggleAdminView,
  isLoadingTx = false,
  refreshTrigger,
}) => {
  const [bottomTab, setBottomTab] = useState<BottomTabKey>(() => {
    const t = peekPostTxViewTarget();
    return shouldAutoOpenMatrixTarget(t) ? 'matrix' : 'home';
  });
  const [activeModal, setActiveModal] = useState<DetailModalKey>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isClearingCache, setIsClearingCache] = useState<boolean>(false);
  const [clearCacheNotice, setClearCacheNotice] = useState<string>('');
  const [reports, setReports] = useState<any[]>([]);
  const [systemPools, setSystemPools] = useState<any>(null);
  const [rankCounts, setRankCounts] = useState<Record<number, number>>({});
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [recentUpgrades, setRecentUpgrades] = useState<any[]>([]);
  const [copiedRef, setCopiedRef] = useState<boolean>(false);
  const [refStatusText, setRefStatusText] = useState<string>('');
  const [historyFilter, setHistoryFilter] = useState<
    'all' | 'direct' | 'level' | 'vault' | 'upgrade' | 'auto_id' | 'extra_id' | 'registration'
  >('all');
  const [historyRankFilter, setHistoryRankFilter] = useState<'all' | number>('all');
  const [isHistoryRankDropdownOpen, setIsHistoryRankDropdownOpen] = useState<boolean>(false);
  const historyRankDropdownRef = useRef<HTMLDivElement | null>(null);
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyStartDateTime, setHistoryStartDateTime] = useState<string>('');
  const [historyEndDateTime, setHistoryEndDateTime] = useState<string>('');
  const [idSpecificUpgradesState, setIdSpecificUpgradesState] = useState<{
    mainId: number;
    rows: any[];
  }>({ mainId: 0, rows: [] });
  const [vaultPoolTab, setVaultPoolTab] = useState<'all' | 'upgrade' | 'auto_id' | 'extra_id'>('all');
  const [vaultDirectionFilter, setVaultDirectionFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [incomeModalFilter, setIncomeModalFilter] = useState<'all' | 'direct' | 'level'>('all');
  const [incomeModalRankFilter, setIncomeModalRankFilter] = useState<'all' | number>('all');
  const [matrixTargetRank, setMatrixTargetRank] = useState<number | undefined>(() => {
    const t = peekPostTxViewTarget();
    if (shouldAutoOpenMatrixTarget(t)) {
      const r = Number(t?.selectedRank || t?.targetRank || 1);
      return r >= 1 && r <= 18 ? r : 1;
    }
    return undefined;
  });
  const [matrixTargetRootNodeId, setMatrixTargetRootNodeId] = useState<number | null>(() => {
    const t = peekPostTxViewTarget();
    if (
      shouldAutoOpenMatrixTarget(t) &&
      t?.type === 'register' &&
      t?.focusNodeId &&
      Number(t.focusNodeId) > 0
    ) {
      return Number(t.focusNodeId);
    }
    return null;
  });
  const [matrixFocusVersion, setMatrixFocusVersion] = useState<number>(0);
  const [unilevelTargetRootId, setUnilevelTargetRootId] = useState<number | null>(null);
  const [unilevelFocusVersion, setUnilevelFocusVersion] = useState<number>(0);
  const [selectedSubIdTarget, setSelectedSubIdTarget] = useState<{
    kind: 'CLONE' | 'EXTRA';
    rank: number;
    nodeId: number;
    mainId: number;
  } | null>(null);
  const [membersData, setMembersData] = useState<any>(null);
  const [membersLoading, setMembersLoading] = useState<boolean>(false);
  const [membersError, setMembersError] = useState<string>('');
  const [membersScope, setMembersScope] = useState<'all' | 'direct' | 'subtree'>('all');
  const [membersSelectedRank, setMembersSelectedRank] = useState<number | 'all'>('all');
  const [membersSearch, setMembersSearch] = useState<string>('');
  const [liveOnChainPools, setLiveOnChainPools] = useState<{
    mainId: number;
    contract: string;
    currentRank: number;
    upgradeRankPool: number;
    newAutoIdPool: number;
    newExtraIdPool: number;
  } | null>(null);

  const lastPerIdSigRef = useRef<string>('');
  const lastCountsSigRef = useRef<string>('');
  const lastTxSigRef = useRef<string>('');
  const lastUpgradeSigRef = useRef<string>('');
  const lastForceSyncAtRef = useRef<number>(0);
  const rpcProvidersCacheRef = useRef<Map<string, ethers.JsonRpcProvider>>(new Map());

  useEffect(() => {
    setSelectedSubIdTarget(null);
  }, [account]);

  useEffect(() => {
    if (!isHistoryRankDropdownOpen) return;
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (
        historyRankDropdownRef.current &&
        !historyRankDropdownRef.current.contains(event.target as Node)
      ) {
        setIsHistoryRankDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [isHistoryRankDropdownOpen]);

  const openVaultModal = useCallback(
    (tab: 'all' | 'upgrade' | 'auto_id' | 'extra_id' = 'all') => {
      setVaultPoolTab(tab);
      setVaultDirectionFilter('ALL');
      setActiveModal('vault');
    },
    []
  );

  const openDashboard2Matrix = useCallback(
    (targetRank?: number, targetRootId?: number | null) => {
      setMatrixTargetRank(targetRank);
      setMatrixTargetRootNodeId(targetRootId ?? null);
      setMatrixFocusVersion((v) => v + 1);
      setActiveModal(null);
      setBottomTab('matrix');
    },
    []
  );

  const openDashboard2Unilevel = useCallback((targetRootId?: number | null) => {
    setUnilevelTargetRootId(targetRootId ?? null);
    setUnilevelFocusVersion((v) => v + 1);
    setActiveModal(null);
    setBottomTab('unilevel');
  }, []);

  useEffect(() => {
    const handlePostTxView = (event: Event) => {
      const detail = (event as CustomEvent<PostTxViewTarget>).detail;
      if (!shouldAutoOpenMatrixTarget(detail)) return;
      const targetRank = Math.max(
        1,
        Math.min(18, Number(detail.selectedRank || detail.targetRank || 1))
      );
      const targetMain = Number(detail.selectedMainId || detail.mainId || 0);
      setSelectedSubIdTarget(null);
      if (targetMain > 0) {
        onSelectMainId(String(targetMain));
      }
      const targetRoot =
        detail.type === 'register' && detail.focusNodeId && Number(detail.focusNodeId) > 0
          ? Number(detail.focusNodeId)
          : null;
      openDashboard2Matrix(targetRank, targetRoot);
    };
    window.addEventListener(POST_TX_VIEW_EVENT, handlePostTxView);
    return () => window.removeEventListener(POST_TX_VIEW_EVENT, handlePostTxView);
  }, [onSelectMainId, openDashboard2Matrix]);

  const activeIdNum = Math.max(1, Number(selectedMainId || profile?.mainNodeIdRank1 || 1));

  const fetchDashboardData = useCallback(async (opts?: { silent?: boolean } | unknown) => {
    const silent = Boolean(opts && typeof opts === 'object' && 'silent' in opts && (opts as { silent?: boolean }).silent);
    if (!silent) setIsSyncing(true);
    try {
      const [perIdRes, countsRes, txRes, upRes] = await Promise.all([
        fetch('/api/matrix/per-id-history', { headers: { Accept: 'application/json' } }).catch(() => null),
        fetch('/api/matrix/rank-counts', { headers: { Accept: 'application/json' } }).catch(() => null),
        fetch('/api/transactions?limit=500', { headers: { Accept: 'application/json' } }).catch(() => null),
        fetch('/api/upgrades', { headers: { Accept: 'application/json' } }).catch(() => null),
      ]);

      const [d, c, t, u] = await Promise.all([
        safeReadJson(perIdRes),
        safeReadJson(countsRes),
        safeReadJson(txRes),
        safeReadJson(upRes),
      ]);

      if (d?.success) {
        const nextReports = Array.isArray(d.reports) ? d.reports : [];
        const totalSig = nextReports.reduce(
          (s: number, r: any) =>
            s +
            Number(r.totalEarnedUsdt || 0) +
            Number(r.upgradeRankPool || 0) +
            Number(r.newAutoIdPool || 0) +
            Number(r.newExtraIdPool || 0) +
            Number(r.totalClonesCount || 0) +
            Number(r.autoIdsCount || 0) +
            Number(r.extraIdsCount || 0),
          0
        );
        const poolSig = d.systemPools ? JSON.stringify(d.systemPools) : '';
        const perIdSig = `${nextReports.length}:${nextReports[0]?.id || 0}:${nextReports[nextReports.length - 1]?.id || 0}:${totalSig.toFixed(2)}:${poolSig}`;
        if (perIdSig !== lastPerIdSigRef.current) {
          lastPerIdSigRef.current = perIdSig;
          setReports(nextReports);
          if (d.systemPools) setSystemPools(d.systemPools);
        }
      }
      if (c?.success && c.counts) {
        const countsSig = JSON.stringify(c.counts);
        if (countsSig !== lastCountsSigRef.current) {
          lastCountsSigRef.current = countsSig;
          setRankCounts(c.counts);
        }
      }
      if (t) {
        const nextTxs = Array.isArray(t?.transactions)
          ? t.transactions
          : Array.isArray(t?.data)
          ? t.data
          : null;
        if (nextTxs) {
          const txSig = `${nextTxs.length}:${nextTxs[0]?.id || nextTxs[0]?.txHash || ''}:${nextTxs[nextTxs.length - 1]?.id || nextTxs[nextTxs.length - 1]?.txHash || ''}`;
          if (txSig !== lastTxSigRef.current) {
            lastTxSigRef.current = txSig;
            setRecentTransactions(nextTxs);
          }
        }
      }
      if (u) {
        const nextUps = Array.isArray(u?.upgrades)
          ? u.upgrades
          : Array.isArray(u?.data)
          ? u.data
          : null;
        if (nextUps) {
          const upSig = `${nextUps.length}:${nextUps[0]?.id || nextUps[0]?.txHash || ''}:${nextUps[nextUps.length - 1]?.id || nextUps[nextUps.length - 1]?.txHash || ''}`;
          if (upSig !== lastUpgradeSigRef.current) {
            lastUpgradeSigRef.current = upSig;
            setRecentUpgrades(nextUps);
          }
        }
      }
    } catch {
      // Ignore transient network or non-JSON proxy responses while syncing
    } finally {
      if (!silent) setIsSyncing(false);
    }
  }, []);

  const handleRefreshAll = useCallback(() => {
    lastPerIdSigRef.current = '';
    lastCountsSigRef.current = '';
    lastTxSigRef.current = '';
    lastUpgradeSigRef.current = '';
    fetchDashboardData();
    onRefreshOnChainData?.();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('matrix:tree:refresh'));
    }
  }, [fetchDashboardData, onRefreshOnChainData]);

  const handleClearCache = useCallback(async () => {
    if (isClearingCache) return;
    setIsClearingCache(true);
    setClearCacheNotice('');
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
      handleRefreshAll();
      setClearCacheNotice(language === 'th' ? 'ล้างแคชสำเร็จ!' : 'Cache cleared!');
      setTimeout(() => setClearCacheNotice(''), 2500);
    } finally {
      setTimeout(() => setIsClearingCache(false), 500);
    }
  }, [isClearingCache, handleRefreshAll, language]);

  useEffect(() => {
    fetchDashboardData();
    const onRefresh = () => {
      lastPerIdSigRef.current = '';
      lastTxSigRef.current = '';
      lastUpgradeSigRef.current = '';
      fetchDashboardData({ silent: true });
    };
    window.addEventListener('matrix:tree:refresh', onRefresh);
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchDashboardData({ silent: true });
    }, 30000);
    return () => {
      window.removeEventListener('matrix:tree:refresh', onRefresh);
      clearInterval(interval);
    };
  }, [fetchDashboardData, contractAddress, refreshTrigger]);

  // Active report for selected Main ID, Clone ID, or Extra ID (scoped to connected wallet when connected)
  const activeReport = useMemo(() => {
    if (reports.length === 0) return null;

    if (selectedSubIdTarget) {
      const { kind, rank: subRank, nodeId: subNodeId, mainId: subMainId } = selectedSubIdTarget;
      const parentMainRep =
        reports.find((r) => !r.isClone && !r.isExtraId && Number(r.id) === subMainId) || null;

      if (kind === 'EXTRA') {
        const spawnedMatch =
          (parentMainRep?.autoExtraIdsSpawned || []).find(
            (ex: any) => Number(ex.rank || 2) === subRank && Number(ex.id) === subNodeId
          ) ||
          reports
            .flatMap((r) => r.autoExtraIdsSpawned || [])
            .find((ex: any) => Number(ex.rank || 2) === subRank && Number(ex.id) === subNodeId);

        const vaultHistory = Array.isArray(spawnedMatch?.vault35History)
          ? spawnedMatch.vault35History
          : [];
        const levelHistory = Array.isArray(spawnedMatch?.level30History)
          ? spawnedMatch.level30History
          : [];
        const directHistory = Array.isArray(spawnedMatch?.direct30History)
          ? spawnedMatch.direct30History
          : [];

        const vaultGross = Number(
          spawnedMatch?.vault35GrossTotalUsdt ??
            vaultHistory.reduce((s: number, h: any) => s + Number(h.amountUsdt || 0), 0)
        );
        const levelTotal = Number(
          spawnedMatch?.level30TotalUsdt ??
            levelHistory.reduce((s: number, h: any) => s + Number(h.amountUsdt || 0), 0)
        );
        const directTotal = Number(
          spawnedMatch?.direct30TotalUsdt ??
            directHistory.reduce((s: number, h: any) => s + Number(h.amountUsdt || 0), 0)
        );

        const extraVaultLedger = vaultHistory.map((h: any, idx: number) => {
          const srcInfo = deriveSourceStatusInfo(
            h.fromNodeType,
            Number(h.fromNodeId || 0),
            Number(h.fromMainId || 0),
            Number(h.rank || subRank)
          );
          return {
            id: `extra-v-${subRank}-${subNodeId}-${idx}`,
            timestamp: String(h.timestamp || ''),
            direction: 'IN',
            actionType: 'RECEIVE_VAULT',
            actionLabelTh: `รับ 35% Vault (Rank ${h.rank || subRank})`,
            rank: Number(h.rank || subRank),
            amountUsdt: Number(h.amountUsdt || 0),
            poolType: 'EXTRA_ID_POOL',
            poolLabelTh: `เข้า Extra Pool Main #${subMainId}`,
            fromNodeId: Number(h.fromNodeId || 0),
            fromMainId: Number(h.fromMainId || 0),
            fromNodeType: srcInfo.idLabel,
            sourceStatusTh: srcInfo.statusTh,
            toNodeId: Number(h.toNodeId || subNodeId),
            toMainId: Number(h.toMainId || subMainId),
            targetStatusTh: `เข้า Extra Pool Main #${subMainId}`,
            descriptionTh: String(
              h.note || `35% Vault ใต้ Extra R${subRank}-#${subNodeId} เข้า Main #${subMainId}`
            ),
            note: String(h.note || ''),
            poolBalanceAfterUsdt: 0,
            balanceAfterUsdt: 0,
          };
        });

        return {
          id: subNodeId,
          label: `Extra R${subRank}-#${subNodeId}`,
          nodeType: 'EXTRA_ID',
          typeBadge: 'EXTRA ID',
          isClone: false,
          isAutoId: false,
          isExtraId: true,
          originMainId: subMainId,
          extraRank: subRank,
          parentId: Number(spawnedMatch?.parentId || 0),
          side: String(spawnedMatch?.side || ''),
          owner: String(spawnedMatch?.owner || parentMainRep?.owner || account || ''),
          directSponsorNodeId: Number(
            spawnedMatch?.directSponsorNodeId || parentMainRep?.directSponsorNodeId || subMainId
          ),
          currentMaxRank: subRank,
          parentMainCurrentMaxRank: Number(parentMainRep?.currentMaxRank || subRank),
          direct30TotalUsdt: Number(directTotal.toFixed(2)),
          direct30History: directHistory,
          level30TotalUsdt: Number(levelTotal.toFixed(2)),
          level30History: levelHistory,
          vault35GrossTotalUsdt: Number(vaultGross.toFixed(2)),
          vault35RemainingTotalUsdt: Number(vaultGross.toFixed(2)),
          vault35DeductedTotalUsdt: 0,
          vault35History: vaultHistory,
          vault35Ledger: extraVaultLedger,
          vaultDeductedBreakdown: {
            extraIdsTotalUsdt: 0,
            autoIdsTotalUsdt: 0,
            upgradesTotalUsdt: 0,
          },
          upgradeRankPool: 0,
          newAutoIdPool: 0,
          newExtraIdPool: 0,
          newExtraIdPoolGross: 0,
          autoIdsSpawned: [],
          autoExtraIdsSpawned: [],
          clonesSpawned: [],
          totalAutoIdCount: 0,
          totalExtraIdCount: 0,
          totalClonesCount: 0,
          allSellQualification: parentMainRep?.allSellQualification,
        };
      }

      const spawnedMatch = (parentMainRep?.clonesSpawned || []).find(
        (c: any) => Number(c.rank || 1) === subRank && Number(c.id) === subNodeId
      );
      const r1CloneRep =
        subRank === 1
          ? reports.find((r) => r.isClone && Number(r.id) === subNodeId) || null
          : null;

      const vaultHistory =
        (Array.isArray(spawnedMatch?.vault35History) && spawnedMatch.vault35History.length > 0
          ? spawnedMatch.vault35History
          : r1CloneRep?.vault35History) || [];
      const levelHistory =
        (Array.isArray(spawnedMatch?.level30History) && spawnedMatch.level30History.length > 0
          ? spawnedMatch.level30History
          : r1CloneRep?.level30History) || [];
      const directHistory =
        (Array.isArray(spawnedMatch?.direct30History) && spawnedMatch.direct30History.length > 0
          ? spawnedMatch.direct30History
          : r1CloneRep?.direct30History) || [];

      const vaultGross = Number(
        spawnedMatch?.vault35GrossTotalUsdt ??
          r1CloneRep?.vault35GrossTotalUsdt ??
          vaultHistory.reduce((s: number, h: any) => s + Number(h.amountUsdt || 0), 0)
      );
      const levelTotal = Number(
        spawnedMatch?.level30TotalUsdt ??
          r1CloneRep?.level30TotalUsdt ??
          levelHistory.reduce((s: number, h: any) => s + Number(h.amountUsdt || 0), 0)
      );
      const directTotal = Number(
        spawnedMatch?.direct30TotalUsdt ??
          r1CloneRep?.direct30TotalUsdt ??
          directHistory.reduce((s: number, h: any) => s + Number(h.amountUsdt || 0), 0)
      );

      const cloneVaultLedger = vaultHistory.map((h: any, idx: number) => {
        const srcInfo = deriveSourceStatusInfo(
          h.fromNodeType,
          Number(h.fromNodeId || 0),
          Number(h.fromMainId || 0),
          Number(h.rank || subRank)
        );
        return {
          id: `clone-v-${subRank}-${subNodeId}-${idx}`,
          timestamp: String(h.timestamp || ''),
          direction: 'IN',
          actionType: 'RECEIVE_VAULT',
          actionLabelTh: `รับ 35% Vault (Rank ${h.rank || subRank})`,
          rank: Number(h.rank || subRank),
          amountUsdt: Number(h.amountUsdt || 0),
          poolType: 'UPGRADE_POOL',
          poolLabelTh: `เข้าถัง Main #${subMainId}`,
          fromNodeId: Number(h.fromNodeId || 0),
          fromMainId: Number(h.fromMainId || 0),
          fromNodeType: srcInfo.idLabel,
          sourceStatusTh: srcInfo.statusTh,
          toNodeId: Number(h.toNodeId || subNodeId),
          toMainId: Number(h.toMainId || subMainId),
          targetStatusTh: `เข้าถัง Main #${subMainId}`,
          descriptionTh: String(
            h.note || `35% Vault ใต้โคลน R${subRank}-#${subNodeId} เข้า Main #${subMainId}`
          ),
          note: String(h.note || ''),
          poolBalanceAfterUsdt: 0,
          balanceAfterUsdt: 0,
        };
      });

      return {
        id: subNodeId,
        label: `โคลน R${subRank}-#${subNodeId}`,
        nodeType: 'CLONE_ID',
        typeBadge: 'CLONE ID',
        isClone: true,
        isAutoId: false,
        isExtraId: false,
        originMainId: subMainId,
        cloneRank: subRank,
        cloneRound: Number(spawnedMatch?.cloneRound || r1CloneRep?.cloneRound || 1),
        cloneSequence: Number(spawnedMatch?.cloneSequence || r1CloneRep?.cloneSequence || 1),
        parentId: Number(spawnedMatch?.parentId || r1CloneRep?.parentId || 0),
        side: String(spawnedMatch?.side || r1CloneRep?.side || ''),
        owner: String(
          spawnedMatch?.owner || r1CloneRep?.owner || parentMainRep?.owner || account || ''
        ),
        directSponsorNodeId: Number(
          spawnedMatch?.directSponsorNodeId ||
            r1CloneRep?.directSponsorNodeId ||
            parentMainRep?.directSponsorNodeId ||
            1
        ),
        currentMaxRank: subRank,
        parentMainCurrentMaxRank: Number(parentMainRep?.currentMaxRank || subRank),
        direct30TotalUsdt: Number(directTotal.toFixed(2)),
        direct30History: directHistory,
        level30TotalUsdt: Number(levelTotal.toFixed(2)),
        level30History: levelHistory,
        vault35GrossTotalUsdt: Number(vaultGross.toFixed(2)),
        vault35RemainingTotalUsdt: Number(vaultGross.toFixed(2)),
        vault35DeductedTotalUsdt: 0,
        vault35History: vaultHistory,
        vault35Ledger: cloneVaultLedger,
        vaultDeductedBreakdown: {
          extraIdsTotalUsdt: 0,
          autoIdsTotalUsdt: 0,
          upgradesTotalUsdt: 0,
        },
        upgradeRankPool: 0,
        newAutoIdPool: 0,
        newExtraIdPool: 0,
        newExtraIdPoolGross: 0,
        autoIdsSpawned: [],
        autoExtraIdsSpawned: [],
        clonesSpawned: [],
        totalAutoIdCount: 0,
        totalExtraIdCount: 0,
        totalClonesCount: 0,
        allSellQualification: parentMainRep?.allSellQualification,
      };
    }

    if (account) {
      const lower = account.toLowerCase();
      const walletOwnedIds = new Set<number>(
        (profile?.ownedMainIdsRank1 || [])
          .map((id: any) => Number(id))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      );
      const walletReports = reports.filter(
        (r) =>
          !r.isClone &&
          !r.isExtraId &&
          (String(r.owner || '').toLowerCase() === lower || walletOwnedIds.has(Number(r.id)))
      );
      const exactWallet = walletReports.find((r) => Number(r.id) === activeIdNum);
      if (exactWallet) return exactWallet;
      if (walletReports.length > 0) return walletReports[0];
    }
    const exact = reports.find((r) => Number(r.id) === activeIdNum);
    if (exact) return exact;
    return reports[0];
  }, [reports, activeIdNum, account, profile?.ownedMainIdsRank1, selectedSubIdTarget]);

  const isViewingClone = Boolean(selectedSubIdTarget?.kind === 'CLONE' && activeReport?.isClone);
  const isViewingExtra = Boolean(selectedSubIdTarget?.kind === 'EXTRA' && activeReport?.isExtraId);
  const isViewingSubId = isViewingClone || isViewingExtra;
  const displayId = Number(activeReport?.id || activeIdNum || 1);
  const effectiveMainId = isViewingSubId ? Number(selectedSubIdTarget!.mainId) : displayId;

  const fetchIdMembers = useCallback(
    async (
      targetMainId: number,
      subScope?: { kind: 'CLONE' | 'EXTRA'; rank: number; nodeId: number } | null,
      opts?: { silent?: boolean }
    ) => {
      const silent = Boolean(opts?.silent);
      if (!silent) setMembersLoading(true);
      setMembersError('');
      try {
        const qs = new URLSearchParams();
        if (subScope && subScope.rank >= 1 && subScope.nodeId > 0) {
          if (subScope.kind === 'EXTRA') {
            qs.set('extraRank', String(subScope.rank));
            qs.set('extraNodeId', String(subScope.nodeId));
          } else {
            qs.set('cloneRank', String(subScope.rank));
            qs.set('cloneNodeId', String(subScope.nodeId));
          }
        }
        const queryStr = qs.toString();
        const url = `/api/matrix/id-members/${targetMainId}${queryStr ? `?${queryStr}` : ''}`;
        const res = await fetch(url, {
          headers: { Accept: 'application/json' },
        });
        const json = await safeReadJson(res);
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || 'ไม่สามารถดึงข้อมูลสมาชิกของ ID นี้ได้');
        }
        setMembersData((prev: any) => {
          const sameMain = Number(json.mainId) === targetMainId;
          const expectedCloneRank = subScope?.kind === 'CLONE' ? subScope.rank : 0;
          const expectedCloneNode = subScope?.kind === 'CLONE' ? subScope.nodeId : 0;
          const expectedExtraRank = subScope?.kind === 'EXTRA' ? subScope.rank : 0;
          const expectedExtraNode = subScope?.kind === 'EXTRA' ? subScope.nodeId : 0;
          const sameClone =
            Number(json.cloneRank || 0) === expectedCloneRank &&
            Number(json.cloneNodeId || 0) === expectedCloneNode;
          const sameExtra =
            Number(json.extraRank || 0) === expectedExtraRank &&
            Number(json.extraNodeId || 0) === expectedExtraNode;
          if (!sameMain || !sameClone || !sameExtra) return prev;
          if (
            prev &&
            Number(prev.mainId) === Number(json.mainId) &&
            Number(prev.cloneRank || 0) === Number(json.cloneRank || 0) &&
            Number(prev.cloneNodeId || 0) === Number(json.cloneNodeId || 0) &&
            Number(prev.extraRank || 0) === Number(json.extraRank || 0) &&
            Number(prev.extraNodeId || 0) === Number(json.extraNodeId || 0) &&
            Number(prev.summary?.totalAllMembersAcrossRanks ?? -1) ===
              Number(json.summary?.totalAllMembersAcrossRanks ?? -2) &&
            Number(prev.summary?.totalUniqueMemberMainIds ?? -1) ===
              Number(json.summary?.totalUniqueMemberMainIds ?? -2) &&
            Number(prev.summary?.totalDirectMainIds ?? -1) ===
              Number(json.summary?.totalDirectMainIds ?? -2) &&
            (prev.ranks?.length || 0) === (json.ranks?.length || 0)
          ) {
            return prev;
          }
          return json;
        });
      } catch (err: any) {
        if (!silent) {
          setMembersError(err?.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูลสมาชิก');
        }
      } finally {
        if (!silent) setMembersLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const sScope = isViewingSubId
      ? {
          kind: selectedSubIdTarget!.kind,
          rank: selectedSubIdTarget!.rank,
          nodeId: selectedSubIdTarget!.nodeId,
        }
      : null;
    fetchIdMembers(effectiveMainId, sScope);
    const onRefresh = () => fetchIdMembers(effectiveMainId, sScope, { silent: true });
    window.addEventListener('matrix:tree:refresh', onRefresh);
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchIdMembers(effectiveMainId, sScope, { silent: true });
    }, 30000);
    return () => {
      window.removeEventListener('matrix:tree:refresh', onRefresh);
      clearInterval(interval);
    };
  }, [
    effectiveMainId,
    isViewingSubId,
    selectedSubIdTarget?.kind,
    selectedSubIdTarget?.rank,
    selectedSubIdTarget?.nodeId,
    refreshTrigger,
    fetchIdMembers,
  ]);

  useEffect(() => {
    let cancelled = false;
    const targetId = effectiveMainId;
    setIdSpecificUpgradesState((prev) =>
      prev.mainId === targetId ? prev : { mainId: targetId, rows: [] }
    );
    const loadIdUpgrades = () => {
      fetch(`/api/upgrades?mainId=${targetId}`, { headers: { Accept: 'application/json' } })
        .then((res) => safeReadJson(res))
        .then((json) => {
          if (cancelled || !json) return;
          const rows = Array.isArray(json.data)
            ? json.data
            : Array.isArray(json.upgrades)
            ? json.upgrades
            : [];
          const filtered = rows.filter((u: any) => Number(u.mainNodeId) === targetId);
          setIdSpecificUpgradesState((prev) => {
            if (
              prev.mainId === targetId &&
              prev.rows.length === filtered.length &&
              (filtered.length === 0 ||
                (prev.rows[0]?.txHash === filtered[0]?.txHash &&
                  prev.rows[prev.rows.length - 1]?.txHash === filtered[filtered.length - 1]?.txHash))
            ) {
              return prev;
            }
            return { mainId: targetId, rows: filtered };
          });
        })
        .catch(() => {});
    };
    loadIdUpgrades();
    if (bottomTab !== 'history') {
      return () => {
        cancelled = true;
      };
    }
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadIdUpgrades();
    }, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [effectiveMainId, refreshTrigger, bottomTab]);

  const currentRank = Math.max(
    1,
    Math.min(18, Number(activeReport?.currentMaxRank || profile?.currentMaxRank || 1))
  );
  const displayOwner = String(
    activeReport?.owner || account || '0x0000000000000000000000000000000000000000'
  );
  const shortWallet = `${displayOwner.slice(0, 6)}...${displayOwner.slice(-5)}`;

  useEffect(() => {
    if (isViewingSubId) return;
    let cancelled = false;
    const targetContract = (contractAddress || CONTRACT_ADDRESS || '').trim();
    if (!targetContract || !ethers.isAddress(targetContract) || !displayId) return;
    if (!displayOwner || displayOwner === ethers.ZeroAddress) return;

    const loadOnChainPools = async () => {
      const rpcList = SUPPORTED_NETWORKS[56]?.rpcUrls || [
        'https://bsc-rpc.publicnode.com',
        'https://bsc-dataseed.binance.org/',
      ];
      for (const rpcUrl of rpcList) {
        try {
          let provider = rpcProvidersCacheRef.current.get(rpcUrl);
          if (!provider) {
            provider = new ethers.JsonRpcProvider(rpcUrl);
            rpcProvidersCacheRef.current.set(rpcUrl, provider);
          }
          const contract = new ethers.Contract(targetContract, MATRIX_ABI, provider);
          const res = await contract.getMainIdThreePools(displayOwner, BigInt(displayId));
          if (cancelled) return;
          const upg = Number(Number(ethers.formatUnits(res[3] ?? 0n, 18)).toFixed(2));
          const auto = Number(Number(ethers.formatUnits(res[4] ?? 0n, 18)).toFixed(2));
          const extra = Number(Number(ethers.formatUnits(res[5] ?? 0n, 18)).toFixed(2));
          const rankVal = Number(res[0] ?? 1);
          const contractLower = targetContract.toLowerCase();
          setLiveOnChainPools((prev) => {
            if (
              prev &&
              prev.mainId === displayId &&
              prev.contract === contractLower &&
              prev.currentRank === rankVal &&
              prev.upgradeRankPool === upg &&
              prev.newAutoIdPool === auto &&
              prev.newExtraIdPool === extra
            ) {
              return prev;
            }
            return {
              mainId: displayId,
              contract: contractLower,
              currentRank: rankVal,
              upgradeRankPool: upg,
              newAutoIdPool: auto,
              newExtraIdPool: extra,
            };
          });
          if (
            activeReport &&
            Number(activeReport.id) === displayId &&
            (Math.abs(auto - Number(activeReport.newAutoIdPool ?? 0)) > 0.01 ||
              Math.abs(upg - Number(activeReport.upgradeRankPool ?? 0)) > 0.01 ||
              Math.abs(extra - Number(activeReport.newExtraIdPool ?? 0)) > 0.01) &&
            Date.now() - lastForceSyncAtRef.current >= 60000
          ) {
            lastForceSyncAtRef.current = Date.now();
            fetch('/api/matrix/per-id-history?forceSync=1', {
              headers: { Accept: 'application/json' },
            })
              .then((r) => safeReadJson(r))
              .then((d) => {
                if (!cancelled && d?.success && Array.isArray(d.reports)) {
                  setReports(d.reports);
                  if (d.systemPools) setSystemPools(d.systemPools);
                }
              })
              .catch(() => {});
          }
          return;
        } catch {
          // try next RPC endpoint
        }
      }
    };

    loadOnChainPools();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      loadOnChainPools();
    }, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [displayId, displayOwner, contractAddress, refreshTrigger, isViewingSubId, activeReport?.id, activeReport?.newAutoIdPool, activeReport?.upgradeRankPool, activeReport?.newExtraIdPool]);

  // Build Vault breakdown from report (synced with live on-chain getMainIdThreePools when available)
  const vaultPools = useMemo(() => {
    const activeContractLower = (contractAddress || CONTRACT_ADDRESS || '').trim().toLowerCase();
    const hasMatchingLivePools =
      !isViewingSubId &&
      liveOnChainPools &&
      liveOnChainPools.mainId === displayId &&
      liveOnChainPools.contract === activeContractLower;

    if (activeReport) {
      const upgradeRankPool = hasMatchingLivePools
        ? liveOnChainPools.upgradeRankPool
        : Number(activeReport.upgradeRankPool ?? 0);
      const newAutoIdPool = hasMatchingLivePools
        ? liveOnChainPools.newAutoIdPool
        : Number(activeReport.newAutoIdPool ?? 0);
      const newExtraIdPool = hasMatchingLivePools
        ? liveOnChainPools.newExtraIdPool
        : Number(activeReport.newExtraIdPool ?? 0);
      const upgradesDeductedUsdt = Number(
        activeReport.vaultDeductedBreakdown?.upgradesTotalUsdt ?? 0
      );
      const autoIdsDeductedUsdt = Number(
        activeReport.vaultDeductedBreakdown?.autoIdsTotalUsdt ?? 0
      );
      const extraIdsDeductedUsdt = Number(
        activeReport.vaultDeductedBreakdown?.extraIdsTotalUsdt ??
          activeReport.extraIdDeductedTotalUsdt ??
          0
      );
      const newExtraIdPoolGross = Number(
        activeReport.newExtraIdPoolGross ?? newExtraIdPool + extraIdsDeductedUsdt
      );
      return {
        upgradeRankPool,
        newAutoIdPool,
        newExtraIdPool,
        upgradesDeductedUsdt,
        autoIdsDeductedUsdt,
        extraIdsDeductedUsdt,
        newExtraIdPoolGross,
        totalRemaining: Number(
          (
            hasMatchingLivePools
              ? upgradeRankPool + newAutoIdPool + newExtraIdPool
              : activeReport.vault35RemainingTotalUsdt ??
                upgradeRankPool + newAutoIdPool + newExtraIdPool
          ).toFixed(2)
        ),
        grossTotal: Number(activeReport.vault35GrossTotalUsdt ?? 0),
        deductedTotal: Number(activeReport.vault35DeductedTotalUsdt ?? 0),
      };
    }
    const vMap: Record<number, number> = {};
    if (Array.isArray(profile?.vaults)) {
      profile.vaults.forEach((v: any) => {
        vMap[Number(v.rank)] = parseFloat(v.balance || '0');
      });
    }
    const calc = calculateMainIdVaultPools(displayId, currentRank, vMap, 0);
    return {
      upgradeRankPool: calc.upgradeRankPool,
      newAutoIdPool: calc.newAutoIdPool,
      newExtraIdPool: calc.newExtraIdPool,
      upgradesDeductedUsdt: 0,
      autoIdsDeductedUsdt: 0,
      extraIdsDeductedUsdt: 0,
      newExtraIdPoolGross: calc.newExtraIdPool,
      totalRemaining: Number(
        (calc.upgradeRankPool + calc.newAutoIdPool + calc.newExtraIdPool).toFixed(2)
      ),
      grossTotal: calc.totalAccumulatedVault,
      deductedTotal: 0,
    };
  }, [activeReport, profile?.vaults, displayId, currentRank, contractAddress, liveOnChainPools, isViewingSubId]);

  const activeMembersData = useMemo(() => {
    if (!membersData || Number(membersData.mainId) !== effectiveMainId) return null;
    if (isViewingClone) {
      if (
        Number(membersData.cloneRank || 0) !== selectedSubIdTarget!.rank ||
        Number(membersData.cloneNodeId || 0) !== selectedSubIdTarget!.nodeId
      ) {
        return null;
      }
    } else if (isViewingExtra) {
      if (
        Number(membersData.extraRank || 0) !== selectedSubIdTarget!.rank ||
        Number(membersData.extraNodeId || 0) !== selectedSubIdTarget!.nodeId
      ) {
        return null;
      }
    } else if (Number(membersData.cloneNodeId || 0) > 0 || Number(membersData.extraNodeId || 0) > 0) {
      return null;
    }
    return membersData;
  }, [membersData, effectiveMainId, isViewingClone, isViewingExtra, selectedSubIdTarget]);

  const idMembersByRank = useMemo(() => {
    const map = new Map<number, any>();
    for (const rGroup of activeMembersData?.ranks || []) {
      map.set(Number(rGroup.rank), rGroup);
    }
    return map;
  }, [activeMembersData]);

  const direct30Total = Number(activeReport?.direct30TotalUsdt ?? 0);
  const level30Total = Number(activeReport?.level30TotalUsdt ?? 0);
  const totalIncomeUsdt = Number((direct30Total + level30Total).toFixed(2));
  const totalMembersR1 = Number(rankCounts[1] ?? reports.length ?? 0);
  const directMainIdsList: any[] = activeReport?.allSellQualification?.directMainIdsList || [];
  const autoIdsSpawnedList: any[] = activeReport?.autoIdsSpawned || [];
  const autoExtraIdsSpawnedList: any[] = activeReport?.autoExtraIdsSpawned || [];
  const totalAutoIds = Number(activeReport?.totalAutoIdCount ?? autoIdsSpawnedList.length ?? 0);
  const totalExtraIds = Number(
    activeReport?.totalExtraIdCount ?? autoExtraIdsSpawnedList.length ?? 0
  );
  const totalClones = Number(activeReport?.totalClonesCount ?? 0);

  const filteredVaultLedger = useMemo(() => {
    const raw: any[] = Array.isArray(activeReport?.vault35Ledger) ? activeReport.vault35Ledger : [];
    return raw.filter((item) => {
      if (vaultPoolTab === 'upgrade' && item.poolType !== 'UPGRADE_POOL') return false;
      if (vaultPoolTab === 'auto_id' && item.poolType !== 'AUTO_ID_POOL') return false;
      if (vaultPoolTab === 'extra_id' && item.poolType !== 'EXTRA_ID_POOL') return false;
      if (vaultDirectionFilter !== 'ALL' && item.direction !== vaultDirectionFilter) return false;
      return true;
    });
  }, [activeReport?.vault35Ledger, vaultPoolTab, vaultDirectionFilter]);

  const nextRank = currentRank < 18 ? currentRank + 1 : 18;
  const nextRankPrice = RANK_PRICES_USDT[nextRank - 1] || 5000;
  const upgradePoolPct =
    currentRank >= 18
      ? 100
      : Math.min(100, (vaultPools.upgradeRankPool / Math.max(1, nextRankPrice)) * 100);
  const autoPoolPct = Math.min(100, (vaultPools.newAutoIdPool / 5) * 100);
  const extraPoolPct = Math.min(100, (vaultPools.newExtraIdPool / 10) * 100);
  const overallRankPct = Math.round((currentRank / 18) * 100);

  const matrixActiveIdSummary = useMemo<MatrixActiveIdSummary>(() => {
    const idMembersCountByRank: Record<number, number> = {};
    for (const [rKey, rGroup] of idMembersByRank.entries()) {
      idMembersCountByRank[rKey] = Number(rGroup?.totalMembersInRank ?? 0);
    }

    const incomeByRank: Record<number, { directUsdt: number; levelUsdt: number; totalUsdt: number }> = {};
    for (let r = 1; r <= 18; r++) {
      incomeByRank[r] = { directUsdt: 0, levelUsdt: 0, totalUsdt: 0 };
    }
    for (const h of activeReport?.direct30History || []) {
      const rNum = Math.max(1, Math.min(18, Number(h.rank || 1)));
      incomeByRank[rNum].directUsdt = Number(
        (incomeByRank[rNum].directUsdt + Number(h.amountUsdt || 0)).toFixed(2)
      );
    }
    for (const h of activeReport?.level30History || []) {
      const rNum = Math.max(1, Math.min(18, Number(h.rank || 1)));
      incomeByRank[rNum].levelUsdt = Number(
        (incomeByRank[rNum].levelUsdt + Number(h.amountUsdt || 0)).toFixed(2)
      );
    }
    for (let r = 1; r <= 18; r++) {
      incomeByRank[r].totalUsdt = Number(
        (incomeByRank[r].directUsdt + incomeByRank[r].levelUsdt).toFixed(2)
      );
    }

    const vaultRemainingByRank: Record<number, number> = {};
    for (let r = 1; r <= 18; r++) {
      vaultRemainingByRank[r] = 0;
    }
    if (isViewingSubId) {
      const subR = Math.max(1, Math.min(18, Number(selectedSubIdTarget?.rank || currentRank || 1)));
      vaultRemainingByRank[subR] = Number((vaultPools.grossTotal || 0).toFixed(2));
    } else {
      const rankNodes = Array.isArray(activeReport?.rankNodesList)
        ? activeReport.rankNodesList
        : [];
      for (const rn of rankNodes) {
        const rNum = Number(rn.rank || 0);
        if (rNum >= 1 && rNum <= 18) {
          vaultRemainingByRank[rNum] = Number(
            (vaultRemainingByRank[rNum] + Number(rn.nodeVault || 0)).toFixed(2)
          );
        }
      }
    }

    const typeBadge: MatrixActiveIdSummary['typeBadge'] = isViewingClone
      ? 'CLONE ID'
      : isViewingExtra
      ? 'EXTRA ID'
      : activeReport?.isAutoId
      ? 'AUTO ID'
      : 'MAIN ID';

    const label = isViewingClone
      ? `โคลน R${selectedSubIdTarget!.rank}-#${displayId}`
      : isViewingExtra
      ? `Extra R${selectedSubIdTarget!.rank}-#${displayId}`
      : activeReport?.isAutoId
      ? `Auto ID #${displayId}`
      : `Main ID #${displayId}`;

    return {
      displayId,
      mainId: effectiveMainId,
      label,
      typeBadge,
      isSubId: isViewingSubId,
      subKind: isViewingSubId ? selectedSubIdTarget!.kind : undefined,
      subRank: isViewingSubId ? selectedSubIdTarget!.rank : undefined,
      subNodeId: isViewingSubId ? selectedSubIdTarget!.nodeId : undefined,
      cloneSequence: isViewingClone ? Number(activeReport?.cloneSequence || 1) : undefined,
      cloneRound: isViewingClone ? Number(activeReport?.cloneRound || 1) : undefined,
      currentRank,
      owner: displayOwner,
      directSponsorNodeId: Number(activeReport?.directSponsorNodeId || 1),
      direct30TotalUsdt: direct30Total,
      level30TotalUsdt: level30Total,
      totalIncomeUsdt,
      vaultRemainingUsdt: isViewingSubId ? vaultPools.grossTotal : vaultPools.totalRemaining,
      incomeByRank,
      vaultRemainingByRank,
      totalClonesCount: totalClones,
      totalAutoIdCount: totalAutoIds,
      totalExtraIdCount: totalExtraIds,
      totalMembersAllRanks: Number(activeMembersData?.summary?.totalAllMembersAcrossRanks ?? 0),
      idMembersCountByRank,
    };
  }, [
    idMembersByRank,
    isViewingClone,
    isViewingExtra,
    isViewingSubId,
    selectedSubIdTarget,
    activeReport,
    displayId,
    effectiveMainId,
    currentRank,
    displayOwner,
    direct30Total,
    level30Total,
    totalIncomeUsdt,
    vaultPools.grossTotal,
    vaultPools.totalRemaining,
    totalClones,
    totalAutoIds,
    totalExtraIds,
    activeMembersData,
  ]);

  const referralUrl = useMemo(() => buildReferralLink(effectiveMainId), [effectiveMainId]);

  const handleCopyReferral = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopiedRef(true);
      setRefStatusText(
        language === 'th'
          ? `คัดลอกลิงก์ของ ID #${effectiveMainId} เรียบร้อยแล้ว`
          : `Referral link for ID #${effectiveMainId} copied!`
      );
      setTimeout(() => setCopiedRef(false), 2000);
    } catch {
      setRefStatusText(
        language === 'th' ? 'กรุณาคัดลอกลิงก์จากช่องด้านบน' : 'Please copy the link above manually'
      );
    }
  };

  // Main & Auto IDs strictly owned by the currently connected wallet (for Switch ID modal)
  const ownedWalletReports = useMemo(() => {
    if (!account) return [];
    const walletLower = account.toLowerCase();
    const profileOwnedSet = new Set<number>(
      (profile?.ownedMainIdsRank1 || [])
        .map((id: any) => Number(id))
        .filter((n: number) => Number.isFinite(n) && n > 0)
    );

    const map = new Map<
      number,
      {
        key: string;
        id: number;
        mainIdToSelect: number;
        label: string;
        badge: string;
        rank: number;
        directSponsorNodeId: number;
        owner: string;
        isExtra?: boolean;
        isAuto?: boolean;
        clonesCount: number;
      }
    >();

    for (const r of reports) {
      if (r.isClone || r.isExtraId) continue;
      const numId = Number(r.id);
      const isOwnedByAccount =
        String(r.owner || '').toLowerCase() === walletLower || profileOwnedSet.has(numId);
      if (!isOwnedByAccount) continue;
      map.set(numId, {
        key: `MAIN-${numId}`,
        id: numId,
        mainIdToSelect: numId,
        label: r.isAutoId ? `Auto ID #${numId}` : `Main ID #${numId}`,
        badge: r.isAutoId ? 'AUTO ID' : 'MAIN ID',
        rank: Number(r.currentMaxRank || 1),
        directSponsorNodeId: Number(r.directSponsorNodeId || 1),
        owner: String(r.owner || account),
        isAuto: Boolean(r.isAutoId),
        clonesCount: Number(r.totalClonesCount || 0),
      });
    }

    for (const id of profileOwnedSet) {
      if (!map.has(id)) {
        map.set(id, {
          key: `MAIN-${id}`,
          id,
          mainIdToSelect: id,
          label: `Main ID #${id}`,
          badge: 'MAIN ID',
          rank: Number(profile?.currentMaxRank || 1),
          directSponsorNodeId: Number(profile?.sponsorMainNodeId || 1),
          owner: account,
          isAuto: false,
          clonesCount: 0,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.id - b.id);
  }, [reports, account, profile?.ownedMainIdsRank1, profile?.currentMaxRank, profile?.sponsorMainNodeId]);

  const ownedExtraIds = useMemo(() => {
    if (!account) return [];
    const walletLower = account.toLowerCase();
    const profileOwnedMainSet = new Set<number>(
      (profile?.ownedMainIdsRank1 || [])
        .map((id: any) => Number(id))
        .filter((n: number) => Number.isFinite(n) && n > 0)
    );
    const extras: Array<{
      key: string;
      id: number;
      rank: number;
      mainId: number;
      label: string;
      parentId: number;
      side: string;
      directSponsorNodeId: number;
      direct30TotalUsdt: number;
      level30TotalUsdt: number;
      vault35GrossTotalUsdt: number;
      totalIncomeUsdt: number;
      timestamp?: string;
    }> = [];
    const seen = new Set<string>();

    for (const r of reports) {
      const reportMainId = Number(r.originMainId || r.id || 0);
      const reportOwnerLower = String(r.owner || '').toLowerCase();
      const isReportOwned =
        reportOwnerLower === walletLower || profileOwnedMainSet.has(Number(r.id));

      for (const ex of r.autoExtraIdsSpawned || []) {
        const exOwnerLower = String(ex.owner || r.owner || '').toLowerCase();
        if (exOwnerLower !== walletLower && !isReportOwned) continue;
        const exId = Number(ex.id || 0);
        const exRank = Number(ex.rank || 2);
        if (exId <= 0) continue;
        const key = `${exRank}-${exId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const d30 = Number(ex.direct30TotalUsdt ?? 0);
        const l30 = Number(ex.level30TotalUsdt ?? 0);
        const v35 = Number(ex.vault35GrossTotalUsdt ?? 0);
        extras.push({
          key,
          id: exId,
          rank: exRank,
          mainId: Number(ex.mainId || r.id || reportMainId || ex.directSponsorNodeId || 1),
          label: ex.label || `Extra R${exRank}-#${exId}`,
          parentId: Number(ex.parentId || 0),
          side: String(ex.side || ''),
          directSponsorNodeId: Number(ex.directSponsorNodeId || r.id || 1),
          direct30TotalUsdt: d30,
          level30TotalUsdt: l30,
          vault35GrossTotalUsdt: v35,
          totalIncomeUsdt: Number((d30 + l30).toFixed(2)),
          timestamp: ex.timestamp,
        });
      }
    }
    return extras.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.id - b.id));
  }, [reports, account, profile?.ownedMainIdsRank1]);

  const ownedCloneIds = useMemo(() => {
    if (!account) return [];
    const walletLower = account.toLowerCase();
    const profileOwnedMainSet = new Set<number>(
      (profile?.ownedMainIdsRank1 || [])
        .map((id: any) => Number(id))
        .filter((n: number) => Number.isFinite(n) && n > 0)
    );
    const clones: Array<{
      key: string;
      id: number;
      rank: number;
      mainId: number;
      label: string;
      parentId: number;
      side: string;
      directSponsorNodeId: number;
      cloneRound: number;
      cloneSequence: number;
      direct30TotalUsdt: number;
      level30TotalUsdt: number;
      vault35GrossTotalUsdt: number;
      totalIncomeUsdt: number;
      timestamp?: string;
    }> = [];
    const seen = new Set<string>();

    for (const r of reports) {
      const reportMainId = Number(r.originMainId || r.id || 0);
      const reportOwnerLower = String(r.owner || '').toLowerCase();
      const isReportOwned =
        reportOwnerLower === walletLower || profileOwnedMainSet.has(Number(r.id));

      for (const c of r.clonesSpawned || []) {
        const cOwnerLower = String(c.owner || r.owner || '').toLowerCase();
        if (cOwnerLower !== walletLower && !isReportOwned) continue;
        const cId = Number(c.id || 0);
        const cRank = Number(c.rank || 1);
        if (cId <= 0) continue;
        const key = `${cRank}-${cId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const r1CloneFallback =
          cRank === 1 ? reports.find((rr) => rr.isClone && Number(rr.id) === cId) : null;
        const d30 = Number(c.direct30TotalUsdt ?? r1CloneFallback?.direct30TotalUsdt ?? 0);
        const l30 = Number(c.level30TotalUsdt ?? r1CloneFallback?.level30TotalUsdt ?? 0);
        const v35 = Number(c.vault35GrossTotalUsdt ?? r1CloneFallback?.vault35GrossTotalUsdt ?? 0);
        clones.push({
          key,
          id: cId,
          rank: cRank,
          mainId: Number(r.id || reportMainId || 1),
          label: c.label || `Main #${Number(r.id || 1)} (โคลน R${cRank}-#${cId})`,
          parentId: Number(c.parentId || 0),
          side: String(c.side || ''),
          directSponsorNodeId: Number(c.directSponsorNodeId || r.directSponsorNodeId || 1),
          cloneRound: Number(c.cloneRound || 1),
          cloneSequence: Number(c.cloneSequence || 1),
          direct30TotalUsdt: d30,
          level30TotalUsdt: l30,
          vault35GrossTotalUsdt: v35,
          totalIncomeUsdt: Number((d30 + l30).toFixed(2)),
          timestamp: c.timestamp,
        });
      }

      if (r.isClone && isReportOwned) {
        const cId = Number(r.id || 0);
        if (cId > 0) {
          const key = `1-${cId}`;
          if (!seen.has(key)) {
            seen.add(key);
            const d30 = Number(r.direct30TotalUsdt ?? 0);
            const l30 = Number(r.level30TotalUsdt ?? 0);
            const v35 = Number(r.vault35GrossTotalUsdt ?? 0);
            clones.push({
              key,
              id: cId,
              rank: 1,
              mainId: reportMainId > 0 ? reportMainId : 1,
              label: r.label || `Main #${reportMainId} (โคลน R1-#${cId})`,
              parentId: Number(r.parentId || 0),
              side: String(r.side || r.sideInR1 || ''),
              directSponsorNodeId: Number(r.directSponsorNodeId || 1),
              cloneRound: Number(r.cloneRound || 1),
              cloneSequence: Number(r.cloneSequence || 1),
              direct30TotalUsdt: d30,
              level30TotalUsdt: l30,
              vault35GrossTotalUsdt: v35,
              totalIncomeUsdt: Number((d30 + l30).toFixed(2)),
            });
          }
        }
      }
    }

    for (const rawId of profile?.ownedCloneIdsRank1 || []) {
      const cId = Number(rawId);
      if (!Number.isFinite(cId) || cId <= 0) continue;
      const key = `1-${cId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fallbackMainId = Number(profile?.mainNodeIdRank1 || ownedWalletReports[0]?.id || 1);
      clones.push({
        key,
        id: cId,
        rank: 1,
        mainId: fallbackMainId,
        label: `Main #${fallbackMainId} (โคลน R1-#${cId})`,
        parentId: 0,
        side: '',
        directSponsorNodeId: Number(profile?.sponsorMainNodeId || 1),
        cloneRound: 1,
        cloneSequence: 1,
        direct30TotalUsdt: 0,
        level30TotalUsdt: 0,
        vault35GrossTotalUsdt: 0,
        totalIncomeUsdt: 0,
      });
    }

    return clones.sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.id - b.id));
  }, [
    reports,
    account,
    profile?.ownedMainIdsRank1,
    profile?.ownedCloneIdsRank1,
    profile?.mainNodeIdRank1,
    profile?.sponsorMainNodeId,
    ownedWalletReports,
  ]);

  const allSellPools: any[] = activeReport?.allSellQualification?.pools || [];

  const renderRankCard = (n: number, keyPrefix: 'inline' | 'modal' = 'inline') => {
    const isCurrent = n === currentRank;
    const isUnlocked = n < currentRank;
    const priceUsdt = RANK_PRICES_USDT[n - 1] || 5;
    const membersInRankSystem = Number(rankCounts[n] ?? 0);
    const idRankObj = idMembersByRank.get(n);
    const idMembersInRank = idRankObj ? Number(idRankObj.totalMembersInRank ?? 0) : null;
    const req = ALLSELL_DIRECT_REQUIREMENTS[n];
    const matchingPool = allSellPools.find((p) => Number(p.targetRank) === n);

    return (
      <article
        key={`d2-${keyPrefix}-rank-${n}`}
        onClick={() => openDashboard2Matrix(n)}
        className={`rounded-[16px] p-2.5 sm:p-3 min-w-0 cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.98] ${
          isCurrent
            ? 'bg-gradient-to-br from-[#087cf4] to-[#0646b3] border border-[#5ddcff] text-white shadow-[0_5px_14px_rgba(8,101,215,0.47)]'
            : isUnlocked
            ? 'bg-gradient-to-br from-[#f2fbff] to-[#cdeaff] border border-[#6ec8ff] text-[#09265f] shadow-[0_4px_11px_rgba(7,86,165,0.16)]'
            : 'bg-gradient-to-br from-white to-[#d9efff] border border-[#a6d8ff] text-[#09265f] shadow-[0_4px_11px_rgba(7,86,165,0.16)]'
        }`}
      >
        <div className="flex items-center justify-between gap-1 mb-1.5">
          <b
            className={`text-[13px] sm:text-[15px] font-black tabular-nums ${
              isCurrent ? 'text-white' : 'text-[#0754b9]'
            }`}
          >
            RANK {n}
          </b>
          <span
            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-[10px] whitespace-nowrap tabular-nums ${
              isCurrent
                ? 'bg-[#ffdf6d] text-[#173b77]'
                : isUnlocked
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-[#d7efff] text-[#0754b9]'
            }`}
          >
            {isCurrent
              ? 'CURRENT'
              : isUnlocked
              ? 'UNLOCKED'
              : n === 1
              ? 'START'
              : `${priceUsdt.toLocaleString()}U`}
          </span>
        </div>

        <div
          className={`text-[10.5px] sm:text-[11px] leading-relaxed tabular-nums ${
            isCurrent ? 'text-[#e3f6ff]' : 'text-[#45668f]'
          }`}
        >
          <div>
            ราคา:{' '}
            <strong className={isCurrent ? 'text-white' : 'text-[#082d73]'}>
              {priceUsdt.toLocaleString()} U
            </strong>
          </div>
          <div className="flex items-center justify-between gap-1">
            <span>
              สมาชิก ID นี้:{' '}
              <strong className={isCurrent ? 'text-[#ffdf6d]' : 'text-[#0754b9]'}>
                {idMembersInRank !== null ? idMembersInRank : membersInRankSystem}
              </strong>
            </span>
            {idMembersInRank !== null && idMembersInRank > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMembersSelectedRank(n);
                  setActiveModal('members');
                }}
                className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold underline cursor-pointer ${
                  isCurrent ? 'text-cyan-100' : 'text-[#087cf4]'
                }`}
              >
                ดูรายชื่อ
              </button>
            )}
          </div>
          <div className="text-[9.5px] opacity-80">
            ทั้งระบบ: {membersInRankSystem} โหนด
          </div>
          <div>
            Direct Sponsor:{' '}
            <strong
              className={
                isCurrent
                  ? 'text-[#ffdf6d]'
                  : req
                  ? 'text-[#b45309]'
                  : 'text-[#082d73]'
              }
            >
              {req
                ? matchingPool
                  ? `${matchingPool.qualifiedDirectCount}/${req.count} IDs*`
                  : req.label
                : 'ไม่กำหนด'}
            </strong>
          </div>
        </div>
      </article>
    );
  };

  type HistoryKind =
    | 'direct'
    | 'level'
    | 'vault'
    | 'upgrade'
    | 'auto_id'
    | 'extra_id'
    | 'registration';
  type CombinedHistoryRow = {
    id: string;
    kind: HistoryKind;
    label: string;
    rank: number;
    fromRank?: number;
    toRank?: number;
    fromNodeId: number;
    fromMainId?: number;
    fromNodeType?: string;
    sourceStatusTh?: string;
    toNodeId?: number;
    parentId?: number;
    side?: string;
    amount: number;
    vaultDeducted?: number;
    isOutflow?: boolean;
    isClone?: boolean;
    isAdminFree?: boolean;
    poolLabel?: string;
    note: string;
    timestamp: string;
    formattedDateTime: string;
    txHash?: string;
  };

  const idCloneNodeIds = useMemo(() => {
    const set = new Set<number>();
    if (activeReport && Number(activeReport.id) === displayId) {
      for (const c of activeReport.clonesSpawned || []) {
        const cid = Number(c?.id || 0);
        if (cid > 0) set.add(cid);
      }
      for (const rn of activeReport.rankNodesList || []) {
        if (rn?.isClone && Number(rn.id) > 0) set.add(Number(rn.id));
      }
    }
    return set;
  }, [activeReport, displayId]);

  const combinedHistoryRows = useMemo<CombinedHistoryRow[]>(() => {
    if (!activeReport || Number(activeReport.id) !== displayId) return [];
    const rows: CombinedHistoryRow[] = [];

    const findMatchingTxHash = (
      kind: 'reg' | 'upgrade' | 'DIRECT' | 'LEVEL' | 'UPGRADE_VAULT',
      nodeId: number,
      rank: number
    ): string | undefined => {
      const hit = recentTransactions.find((t: any) => {
        if (!isRealChainTxHash(t?.txHash)) return false;
        const cat = String(t.category || '').toUpperCase();
        if (kind === 'reg') {
          return (
            t.id === `reg-r1-${nodeId}` ||
            (cat === 'REGISTRATION' &&
              Number(t.mainNodeId) === nodeId &&
              Number(t.rank || 1) === rank)
          );
        }
        if (kind === 'upgrade') {
          return (
            cat === 'UPGRADE' &&
            Number(t.mainNodeId) === nodeId &&
            Number(t.rank) === rank
          );
        }
        return (
          cat === 'PAYOUT' &&
          String(t.rewardType || '').toUpperCase() === kind &&
          Number(t.fromNodeId) === nodeId &&
          Number(t.rank || 1) === rank &&
          (Number(t.mainNodeId) === displayId ||
            Number(t.toNodeId) === displayId ||
            idCloneNodeIds.has(Number(t.toNodeId || t.mainNodeId || 0)))
        );
      });
      return hit?.txHash;
    };

    const vaultInLedger: any[] = (activeReport.vault35Ledger || []).filter(
      (item: any) => item.direction === 'IN'
    );
    const usedLedgerIdx = new Set<number>();

    (activeReport.direct30History || []).forEach((h: any, i: number) => {
      const ts = String(h.timestamp || '');
      const rank = Number(h.rank || 1);
      const fromId = Number(h.fromNodeId || 0);
      const fromMain = Number(h.fromMainId || 0);
      const srcInfo = deriveSourceStatusInfo(h.fromNodeType, fromId, fromMain, rank);
      rows.push({
        id: `d-${i}-${fromId}-${rank}`,
        kind: 'direct',
        label: '30% แนะนำตรง',
        rank,
        fromNodeId: fromId,
        fromMainId: fromMain,
        fromNodeType: srcInfo.idLabel,
        sourceStatusTh: srcInfo.statusTh,
        toNodeId: Number(h.toNodeId || 0),
        amount: Number(h.amountUsdt || 0),
        note: String(h.note || ''),
        timestamp: ts,
        formattedDateTime: formatThaiDateTime(ts),
        txHash: isRealChainTxHash(h.txHash)
          ? h.txHash
          : findMatchingTxHash('DIRECT', fromId, rank),
      });
    });

    (activeReport.level30History || []).forEach((h: any, i: number) => {
      const ts = String(h.timestamp || '');
      const rank = Number(h.rank || 1);
      const fromId = Number(h.fromNodeId || 0);
      const fromMain = Number(h.fromMainId || 0);
      const srcInfo = deriveSourceStatusInfo(h.fromNodeType, fromId, fromMain, rank);
      rows.push({
        id: `l-${i}-${fromId}-${rank}`,
        kind: 'level',
        label: h.tier ? `ค่าชั้น Lv.${h.tier}` : '30% ค่าชั้น',
        rank,
        fromNodeId: fromId,
        fromMainId: fromMain,
        fromNodeType: srcInfo.idLabel,
        sourceStatusTh: srcInfo.statusTh,
        toNodeId: Number(h.toNodeId || 0),
        amount: Number(h.amountUsdt || 0),
        note: String(h.note || ''),
        timestamp: ts,
        formattedDateTime: formatThaiDateTime(ts),
        txHash: isRealChainTxHash(h.txHash)
          ? h.txHash
          : findMatchingTxHash('LEVEL', fromId, rank),
      });
    });

    (activeReport.vault35History || []).forEach((h: any, i: number) => {
      const ts = String(h.timestamp || '');
      const rank = Number(h.rank || 1);
      const fromId = Number(h.fromNodeId || 0);
      const fromMain = Number(h.fromMainId || 0);
      const srcInfo = deriveSourceStatusInfo(h.fromNodeType, fromId, fromMain, rank);
      const amt = Number(h.amountUsdt || 0);
      const ledgerMatchIdx = vaultInLedger.findIndex(
        (lv, idx) =>
          !usedLedgerIdx.has(idx) &&
          Number(lv.rank) === rank &&
          Math.abs(Number(lv.amountUsdt || 0) - amt) < 0.01 &&
          (!ts || !lv.timestamp || lv.timestamp === ts)
      );
      if (ledgerMatchIdx >= 0) usedLedgerIdx.add(ledgerMatchIdx);
      const poolLabel =
        ledgerMatchIdx >= 0 ? String(vaultInLedger[ledgerMatchIdx]?.poolLabelTh || '') : '';
      rows.push({
        id: `v-${i}-${fromId}-${rank}`,
        kind: 'vault',
        label: '35% เข้า Vault',
        rank,
        fromNodeId: fromId,
        fromMainId: fromMain,
        fromNodeType: srcInfo.idLabel,
        sourceStatusTh: srcInfo.statusTh,
        toNodeId: Number(h.toNodeId || 0),
        amount: amt,
        poolLabel: poolLabel || undefined,
        note: String(h.note || ''),
        timestamp: ts,
        formattedDateTime: formatThaiDateTime(ts),
        txHash: isRealChainTxHash(h.txHash)
          ? h.txHash
          : findMatchingTxHash('UPGRADE_VAULT', fromId, rank),
      });
    });

    const isSubNodeReport = Boolean(activeReport.isClone || activeReport.isExtraId);
    const idSpecificRows =
      !isSubNodeReport && idSpecificUpgradesState.mainId === displayId
        ? idSpecificUpgradesState.rows
        : [];
    const mergedUpgradesMap = new Map<string, any>();
    if (!isSubNodeReport) {
      [...recentUpgrades, ...idSpecificRows].forEach((u: any) => {
        if (Number(u.mainNodeId) !== displayId) return;
        const key = `${u.toRank}-${u.newNodeId}-${u.isClone ? 'c' : 'm'}-${u.isExtraId ? 'e' : 'n'}`;
        mergedUpgradesMap.set(key, u);
      });
    }
    const upgradeSource = Array.from(mergedUpgradesMap.values());

    upgradeSource.forEach((u: any, i: number) => {
      if (u.isExtraId) return;
      const fromRank = Number(u.fromRank || 1);
      const toRank = Number(u.toRank || 2);
      const nodeId = Number(u.newNodeId || u.mainNodeId || displayId);
      const rankPrice = Number(u.rankPriceUsdt || RANK_PRICES_USDT[toRank - 1] || 0);
      const vaultDeducted = Number(u.vaultDeductedUsdt || 0);
      const walletPaid = Number(u.walletPaidUsdt || 0);
      const isClone = Boolean(u.isClone);
      const isAdminFree = Boolean(u.isAdminFreeUpgrade);
      const ts = String(u.createdAt || u.timestamp || '');
      const realTx = isRealChainTxHash(u.txHash)
        ? u.txHash
        : findMatchingTxHash('upgrade', displayId, toRank);
      const modeDesc = isClone
        ? 'โคลนนิ่งใน Rank'
        : isAdminFree
        ? 'Admin อัพฟรี (0 U)'
        : u.upgradeMode === 'AUTO_VAULT'
        ? 'Auto Upgrade จาก Vault'
        : walletPaid > 0
        ? `จ่าย Wallet ${walletPaid.toFixed(2)} U`
        : vaultDeducted > 0
        ? `หัก Vault ${vaultDeducted.toFixed(2)} U`
        : `อัปเกรด R${fromRank} → R${toRank}`;
      const parentSide = u.parentId
        ? ` · วางใต้ #${u.parentId} (${u.side === 'RIGHT' ? 'ขวา' : 'ซ้าย'})`
        : '';
      rows.push({
        id: `u-${u.id || i}-${toRank}-${nodeId}`,
        kind: 'upgrade',
        label: isClone ? 'อัพ Rank (โคลนนิ่ง)' : 'อัพเกรด Rank',
        rank: toRank,
        fromRank,
        toRank,
        fromNodeId: nodeId,
        parentId: u.parentId ? Number(u.parentId) : undefined,
        side: u.side,
        amount: isAdminFree ? 0 : rankPrice,
        vaultDeducted,
        isOutflow: !isAdminFree && !isClone,
        isClone,
        isAdminFree,
        note: `อัปเกรด R${fromRank} → R${toRank} · Node #${nodeId} (${modeDesc}${
          vaultDeducted > 0 && walletPaid > 0 ? ` · หัก Vault ${vaultDeducted.toFixed(2)} U` : ''
        })${parentSide}`,
        timestamp: ts,
        formattedDateTime: formatThaiDateTime(ts),
        txHash: realTx,
      });
    });

    (activeReport.autoIdsSpawned || []).forEach((a: any, i: number) => {
      const nodeId = Number(a.id || 0);
      const rank = Number(a.rank || 1);
      const ts = String(a.timestamp || '');
      const price = Number(RANK_PRICES_USDT[rank - 1] || 5);
      const sideTh = a.side === 'RIGHT' ? 'ขวา' : 'ซ้าย';
      rows.push({
        id: `auto-${i}-${nodeId}-${rank}`,
        kind: 'auto_id',
        label: 'สร้าง Auto ID',
        rank,
        fromNodeId: nodeId,
        parentId: Number(a.parentId || 0),
        side: String(a.side || ''),
        amount: price,
        isOutflow: true,
        note: `สร้าง ${a.label || `Auto ID #${nodeId}`} จาก Auto ID Pool · วางใต้ #${
          a.parentId || '-'
        } (ฝั่ง${sideTh})`,
        timestamp: ts,
        formattedDateTime: formatThaiDateTime(ts),
        txHash: findMatchingTxHash('reg', nodeId, rank),
      });
    });

    (activeReport.autoExtraIdsSpawned || []).forEach((ex: any, i: number) => {
      const nodeId = Number(ex.id || 0);
      const rank = Number(ex.rank || 2);
      const ts = String(ex.timestamp || '');
      const price = Number(RANK_PRICES_USDT[rank - 1] || 10);
      const sideTh = ex.side === 'RIGHT' ? 'ขวา' : 'ซ้าย';
      rows.push({
        id: `extra-${i}-${nodeId}-${rank}`,
        kind: 'extra_id',
        label: 'สร้าง Extra ID',
        rank,
        fromNodeId: nodeId,
        parentId: Number(ex.parentId || 0),
        side: String(ex.side || ''),
        amount: price,
        isOutflow: true,
        note: `สร้าง ${ex.label || `Extra R${rank}-#${nodeId}`} จาก Extra ID Pool · วางใต้ #${
          ex.parentId || '-'
        } (ฝั่ง${sideTh})`,
        timestamp: ts,
        formattedDateTime: formatThaiDateTime(ts),
        txHash:
          recentUpgrades.find(
            (u: any) =>
              u.isExtraId &&
              Number(u.newNodeId) === nodeId &&
              Number(u.toRank) === rank &&
              isRealChainTxHash(u.txHash)
          )?.txHash || findMatchingTxHash('reg', nodeId, rank),
      });
    });

    // Own registration / creation event for the switched ID (and its Rank-1 clones)
    const regTxs =
      activeReport.isClone || activeReport.isExtraId
        ? []
        : recentTransactions.filter((t: any) => {
            if (String(t?.category || '').toUpperCase() !== 'REGISTRATION') return false;
            const mId = Number(t.mainNodeId || 0);
            const nId = Number(String(t.id || '').replace('reg-r1-', '') || mId);
            return mId === displayId || nId === displayId;
          });
    const addedRegIds = new Set<string>();
    regTxs.forEach((t: any) => {
      const key = String(t.id || t.txHash || `${t.mainNodeId}-${t.rank}`);
      if (addedRegIds.has(key)) return;
      addedRegIds.add(key);
      const nId = Number(String(t.id || '').replace('reg-r1-', '') || t.mainNodeId || displayId);
      const isSelfClone = nId !== displayId;
      const ts = String(t.timestamp || '');
      rows.push({
        id: `reg-${key}`,
        kind: 'registration',
        label: isSelfClone
          ? 'โคลนนิ่ง Rank 1'
          : activeReport.isAutoId
          ? 'สร้าง Auto ID (เริ่มต้น)'
          : 'สมัครสมาชิก / เปิด ID',
        rank: Number(t.rank || 1),
        fromNodeId: nId,
        isClone: isSelfClone,
        amount: Number(t.amountUsdt || 5),
        isOutflow: true,
        note: String(t.detailsTh || t.titleTh || `เปิดรหัส ID #${nId}`),
        timestamp: ts,
        formattedDateTime: formatThaiDateTime(ts),
        txHash: isRealChainTxHash(t.txHash) ? t.txHash : undefined,
      });
    });

    return rows.sort((a, b) => {
      const ta = new Date(a.timestamp || 0).getTime();
      const tb = new Date(b.timestamp || 0).getTime();
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });
  }, [activeReport, idSpecificUpgradesState, recentUpgrades, recentTransactions, displayId, idCloneNodeIds]);

  const historyRankStats = useMemo(() => {
    const byRank: Record<number, { count: number; incomeUsdt: number }> = {};
    for (let r = 1; r <= 18; r++) {
      byRank[r] = { count: 0, incomeUsdt: 0 };
    }
    let totalIncomeUsdt = 0;
    for (const row of combinedHistoryRows) {
      const rNum = Number(row.kind === 'upgrade' && row.toRank ? row.toRank : row.rank || 0);
      if (rNum >= 1 && rNum <= 18) {
        byRank[rNum].count += 1;
        if (row.kind === 'direct' || row.kind === 'level' || row.kind === 'vault') {
          byRank[rNum].incomeUsdt += Number(row.amount || 0);
          totalIncomeUsdt += Number(row.amount || 0);
        }
      }
    }
    return {
      byRank,
      totalCount: combinedHistoryRows.length,
      totalIncomeUsdt,
    };
  }, [combinedHistoryRows]);

  const rankScopedHistoryRows = useMemo(() => {
    if (historyRankFilter === 'all') return combinedHistoryRows;
    return combinedHistoryRows.filter((r) => {
      const targetRank = Number(r.kind === 'upgrade' && r.toRank ? r.toRank : r.rank || 0);
      return targetRank === historyRankFilter || Number(r.rank) === historyRankFilter;
    });
  }, [combinedHistoryRows, historyRankFilter]);

  const historyCounts = useMemo(() => {
    const counts = {
      all: rankScopedHistoryRows.length,
      direct: 0,
      level: 0,
      vault: 0,
      upgrade: 0,
      auto_id: 0,
      extra_id: 0,
      registration: 0,
    };
    const totals = {
      direct: 0,
      level: 0,
      vault: 0,
    };
    for (const r of rankScopedHistoryRows) {
      counts[r.kind] += 1;
      if (r.kind === 'direct') totals.direct += r.amount;
      if (r.kind === 'level') totals.level += r.amount;
      if (r.kind === 'vault') totals.vault += r.amount;
    }
    return { counts, totals };
  }, [rankScopedHistoryRows]);

  const filteredHistoryRows = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    const startMs = historyStartDateTime ? new Date(historyStartDateTime).getTime() : null;
    const rawEndMs = historyEndDateTime ? new Date(historyEndDateTime).getTime() : null;
    const endMs =
      rawEndMs !== null && Number.isFinite(rawEndMs)
        ? historyEndDateTime.length === 16
          ? rawEndMs + 59999
          : rawEndMs
        : null;

    return rankScopedHistoryRows.filter((r) => {
      if (historyFilter !== 'all' && r.kind !== historyFilter) return false;

      if (startMs !== null && Number.isFinite(startMs)) {
        const ts = new Date(r.timestamp || 0).getTime();
        if (!Number.isFinite(ts) || ts < startMs) return false;
      }

      if (endMs !== null && Number.isFinite(endMs)) {
        const ts = new Date(r.timestamp || 0).getTime();
        if (!Number.isFinite(ts) || ts > endMs) return false;
      }

      if (q) {
        const haystack = [
          r.label,
          r.note,
          `r${r.rank}`,
          `rank ${r.rank}`,
          `#${r.fromNodeId}`,
          r.fromMainId ? `#${r.fromMainId}` : '',
          r.fromNodeType || '',
          r.sourceStatusTh || '',
          r.parentId ? `#${r.parentId}` : '',
          r.txHash || '',
          r.formattedDateTime,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [
    rankScopedHistoryRows,
    historyFilter,
    historySearch,
    historyStartDateTime,
    historyEndDateTime,
  ]);

  const isOwnedByConnectedWallet = Boolean(
    account && displayOwner && account.toLowerCase() === displayOwner.toLowerCase()
  );

  const walletNeededForNextRank = Math.max(
    0,
    Number((nextRankPrice - vaultPools.upgradeRankPool).toFixed(2))
  );
  const needsUsdtApproval = Number(allowance || 0) < walletNeededForNextRank;

  return (
    <div className="relative min-h-screen w-full overflow-x-clip bg-gradient-to-br from-[#043b9c] via-[#087fe9] via-25% to-[#e7f6ff] dark:from-[#021238] dark:via-[#062b78] dark:to-[#071636] text-[#09265f] pb-28 lg:pb-32">
      <div className="relative z-10 mx-auto w-full max-w-[1260px] px-2.5 sm:px-5 lg:px-6 pt-0 space-y-3.5 sm:space-y-4">
        {bottomTab !== 'matrix' && bottomTab !== 'unilevel' && bottomTab !== 'id_vault' && (
          <>
            {/* 1. SAPPHIRE HERO HEADER */}
        <header className="relative min-h-[164px] text-white px-4 sm:px-6 pt-4 pb-9 overflow-hidden bg-[radial-gradient(ellipse_at_80%_72%,rgba(64,217,255,0.53),transparent_35%),linear-gradient(125deg,#05256d,#0066d7_58%,#031e68)] rounded-b-[26px] sm:rounded-b-[28px] shadow-[0_8px_28px_rgba(0,62,155,0.53)] space-y-3">
          {/* Glowing Orbital Arc */}
          <div className="pointer-events-none absolute w-[310px] h-[190px] -right-14 -bottom-20 border-2 border-[#69eaff]/60 rounded-[50%] shadow-[0_0_0_13px_rgba(70,207,255,0.13),0_0_0_28px_rgba(70,207,255,0.09),0_0_30px_#5ceaff] -rotate-24" />

          <div className="relative z-10 flex items-center justify-between gap-2.5 sm:gap-3">
            <div className="min-w-0">
              <FractalFlowBrandCard size="lg" />
            </div>

            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <span className="px-2.5 py-0.5 rounded-full bg-[#22caff]/20 border border-[#72e5ff]/55 text-[10px] font-extrabold text-[#dffbff] whitespace-nowrap shadow-[0_0_10px_rgba(34,202,255,0.28)]">
                {language === 'th' ? 'หน้าหลักสมาชิก' : 'Member Home'}
              </span>
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={() => openDashboard2Unilevel(effectiveMainId)}
                  className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-emerald-500/25 hover:bg-emerald-500/40 border border-emerald-300/50 text-white font-bold text-[11px] sm:text-xs flex items-center gap-1 transition cursor-pointer whitespace-nowrap shadow-sm"
                  title={language === 'th' ? 'เปิดหน้าผัง ยูนิเลเวล 15 ชั้น' : 'Open 15-Level Unilevel Chart'}
                >
                  <span className="text-xs sm:text-sm leading-none">❖</span>
                  <span>ยูนิ 15 ชั้น</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    isViewingSubId
                      ? openDashboard2Matrix(selectedSubIdTarget!.rank, selectedSubIdTarget!.nodeId)
                      : openDashboard2Matrix(1)
                  }
                  className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-white/15 hover:bg-white/25 border border-cyan-300/45 text-white font-bold text-[11px] sm:text-xs flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shadow-sm"
                  title={language === 'th' ? 'เปิดหน้าผัง Matrix 15 ชั้น' : 'Open Matrix 15 Layers'}
                >
                  <span className="text-sm sm:text-base leading-none">♟</span>
                  <span>Matrix 15 ชั้น</span>
                </button>
              </div>
            </div>
          </div>

          {/* F27 ACTION & WALLET BAR (MATCHING TOP BAR IN SCREENSHOT) */}
          <div className="relative z-10 flex items-center justify-between gap-1.5 flex-wrap pt-2 border-t border-white/15">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={onToggleTheme}
                className="px-2.5 py-1 rounded-xl bg-slate-900/45 hover:bg-slate-900/65 border border-cyan-300/35 text-[11px] font-bold text-white inline-flex items-center gap-1 cursor-pointer transition"
                title={theme === 'light' ? 'สลับเป็นโหมดมืด' : 'สลับเป็นโหมดสว่าง'}
              >
                {theme === 'light' ? (
                  <Sun className="w-3.5 h-3.5 text-amber-300" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-cyan-200" />
                )}
                <span>{theme === 'light' ? (language === 'th' ? 'สว่าง' : 'Light') : (language === 'th' ? 'มืด' : 'Dark')}</span>
              </button>

              <button
                type="button"
                onClick={handleClearCache}
                disabled={isClearingCache}
                className="px-2 py-1 rounded-xl bg-rose-500/25 hover:bg-rose-500/40 border border-rose-300/45 text-rose-100 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 transition"
                title={clearCacheNotice || (language === 'th' ? 'ล้างแคช' : 'Clear Cache')}
              >
                <Trash2 className={`w-3.5 h-3.5 ${isClearingCache ? 'animate-spin' : ''}`} />
                {clearCacheNotice && <span className="text-[10px]">{clearCacheNotice}</span>}
              </button>

              <button
                type="button"
                onClick={() => {
                  handleRefreshAll();
                  fetchIdMembers(
                    effectiveMainId,
                    isViewingSubId
                      ? {
                          kind: selectedSubIdTarget!.kind,
                          rank: selectedSubIdTarget!.rank,
                          nodeId: selectedSubIdTarget!.nodeId,
                        }
                      : null
                  );
                }}
                className="p-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-cyan-300/40 text-white transition cursor-pointer"
                title={language === 'th' ? 'รีเฟรชข้อมูลจริง' : 'Refresh Live Data'}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() =>
                  onOpenMatrixTree(isViewingSubId ? selectedSubIdTarget!.rank : 1)
                }
                className="px-2.5 py-1 rounded-xl bg-[#0ea5e9] hover:bg-[#0284c7] border border-cyan-200/50 text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer shadow-xs transition"
                title={language === 'th' ? 'เปิดหน้าผัง Matrix เต็มจอ' : 'Open Matrix Tree'}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{language === 'th' ? 'ผัง Matrix' : 'Matrix'}</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenRegisterModal(null)}
                className="px-2.5 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 border border-emerald-200/60 text-slate-950 text-[11px] font-extrabold inline-flex items-center gap-1 cursor-pointer shadow-xs transition"
                title={language === 'th' ? 'สมัครสมาชิก / เพิ่ม ID ใหม่' : 'Register / Add ID'}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{language === 'th' ? 'สมัคร/เพิ่ม ID' : 'Register / Add ID'}</span>
              </button>

              <button
                type="button"
                onClick={onToggleLanguage}
                className="px-2.5 py-1 rounded-xl bg-white/15 hover:bg-white/25 border border-cyan-300/35 text-[11px] font-mono font-bold text-white cursor-pointer transition"
              >
                {language === 'th' ? '🇬🇧 EN' : '🇹🇭 TH'}
              </button>

              {isAdminUser && onOpenDeployModal && (
                <button
                  type="button"
                  onClick={onOpenDeployModal}
                  className="px-2.5 py-1 rounded-xl bg-emerald-500/30 hover:bg-emerald-500/45 border border-emerald-300/50 text-emerald-50 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition"
                >
                  <Zap className="w-3 h-3" />
                  <span>{language === 'th' ? 'Deploy สัญญา' : 'Deploy'}</span>
                </button>
              )}

              {isAdminUser && onToggleAdminView && (
                <button
                  type="button"
                  onClick={onToggleAdminView}
                  className="px-2.5 py-1 rounded-xl bg-amber-400/25 hover:bg-amber-400/40 border border-amber-300/50 text-amber-100 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition"
                >
                  <Shield className="w-3 h-3" />
                  <span>Admin</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <WalletIncomeNotifier
                account={account}
                language={language}
                theme={theme}
                onRefresh={handleRefreshAll}
              />

              {account ? (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/60 border border-cyan-300/35 text-[11px] font-mono">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="font-bold text-white">
                    {account.slice(0, 6)}...{account.slice(-4)}
                  </span>
                  {onDisconnect && (
                    <button
                      type="button"
                      onClick={onDisconnect}
                      className="pl-1.5 border-l border-white/20 text-rose-300 hover:text-rose-200 font-sans font-bold inline-flex items-center gap-0.5 cursor-pointer"
                      title={language === 'th' ? 'ตัดการเชื่อมต่อกระเป๋า' : 'Disconnect'}
                    >
                      <LogOut className="w-3 h-3" />
                      <span>{language === 'th' ? 'ออก' : 'Exit'}</span>
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onConnectWallet}
                  className="px-2.5 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                >
                  <Wallet className="w-3 h-3" />
                  <span>{language === 'th' ? 'เชื่อมต่อกระเป๋า' : 'Connect'}</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* 2. IDENTITY CARD (MOBILE & PC RESPONSIVE) */}
        <section className="-mt-6 mx-0.5 sm:mx-1 p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-5 rounded-[24px] sm:rounded-[26px] bg-gradient-to-br from-[#fffefa]/95 to-[#d5f3ff]/95 border-2 border-[#a9e7ff] shadow-[0_8px_24px_rgba(0,88,184,0.33)]">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <div className="w-[62px] h-[62px] sm:w-[82px] sm:h-[82px] flex-none rounded-full grid place-items-center text-white text-[32px] sm:text-[40px] bg-[radial-gradient(circle_at_35%_25%,#5ceaff,#087cf4_48%,#032b93)] shadow-[0_0_0_4px_#b7eaff,0_0_18px_#00aaff]">
              ♙
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <strong className="text-[19px] sm:text-[24px] font-black text-[#09265f] leading-tight">
                  {isViewingClone
                    ? `โคลน R${selectedSubIdTarget!.rank}-#${displayId}`
                    : isViewingExtra
                    ? `Extra R${selectedSubIdTarget!.rank}-#${displayId}`
                    : `ID #${displayId}`}
                </strong>
                {isViewingClone && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold">
                    CLONE ID
                  </span>
                )}
                {isViewingExtra && (
                  <span className="px-2 py-0.5 rounded-full bg-violet-600 text-white text-[10px] font-extrabold">
                    EXTRA ID
                  </span>
                )}
                {activeReport?.isAutoId && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-800 text-[10px] font-extrabold">
                    AUTO ID
                  </span>
                )}
                {isViewingSubId && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSubIdTarget(null);
                      setMatrixTargetRootNodeId(null);
                      setMatrixTargetRank(undefined);
                      setMatrixFocusVersion((v) => v + 1);
                      onSelectMainId(String(effectiveMainId));
                    }}
                    className="px-2 py-0.5 rounded-full bg-blue-100 hover:bg-blue-200 border border-blue-300 text-[#0754b9] text-[10px] font-extrabold cursor-pointer transition"
                  >
                    ← กลับ Main #{effectiveMainId}
                  </button>
                )}
              </div>

              <div className="my-1.5 flex items-center gap-1.5 flex-wrap">
                <span className="inline-block bg-gradient-to-r from-[#ffdb62] to-[#fff0a6] rounded-[18px] px-2.5 sm:px-3 py-1 font-bold text-[11px] sm:text-[12px] text-[#09265f] shadow-2xs">
                  {isViewingClone
                    ? `🧬 โคลนของ Main #${effectiveMainId} · Rank ${currentRank}`
                    : isViewingExtra
                    ? `✦ Extra ID ของ Main #${effectiveMainId} · Rank ${currentRank}`
                    : `⭐ Rank ${currentRank} Member`}
                </span>
                <span className="text-[11px] font-bold text-[#0756bc]">
                  {isViewingClone
                    ? `· ครั้งที่ ${activeReport?.cloneSequence || 1} (รอบ ${activeReport?.cloneRound || 1}) · แนะนำ #${activeReport?.directSponsorNodeId || 1}`
                    : isViewingExtra
                    ? `${
                        Number(activeReport?.parentId || 0) > 0
                          ? `· ใต้ #${activeReport?.parentId}${
                              activeReport?.side === 'RIGHT'
                                ? ' (ขวา)'
                                : activeReport?.side === 'LEFT'
                                ? ' (ซ้าย)'
                                : ''
                            }`
                          : ''
                      } · ผู้แนะนำ #${activeReport?.directSponsorNodeId || effectiveMainId}`
                    : `· ผู้แนะนำ #${activeReport?.directSponsorNodeId || 1}`}
                </span>
              </div>

              <div className="text-[11px] sm:text-[12px] font-bold text-[#09265f] truncate font-mono">
                ▣ Wallet: {shortWallet}
                {account && (
                  <span className="ml-2 text-[#0756bc] font-semibold">
                    ({Number(usdtBalance || 0).toFixed(2)} USDT)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-col gap-2 w-full sm:w-auto sm:min-w-[168px] shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#b8e5ff]/70">
            <button
              type="button"
              onClick={() => onOpenRegisterModal(null)}
              className="border-0 rounded-[14px] px-3 py-2.5 sm:py-2 text-white font-bold text-xs sm:text-sm bg-gradient-to-br from-emerald-500 to-teal-600 shadow-[0_4px_12px_rgba(16,185,129,0.38)] hover:brightness-105 transition whitespace-nowrap cursor-pointer inline-flex items-center justify-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5 shrink-0" />
              <span>{language === 'th' ? 'สมัคร/เพิ่ม ID' : 'Register / Add ID'}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveModal('switch_id')}
              className="border-0 rounded-[14px] px-3 py-2.5 sm:py-2 text-white font-bold text-xs sm:text-sm bg-gradient-to-br from-[#23caff] to-[#0755d7] shadow-[0_5px_15px_rgba(8,124,244,0.47)] hover:brightness-105 transition whitespace-nowrap cursor-pointer"
            >
              ⇄ {language === 'th' ? 'สลับไอดี' : 'Switch ID'}
            </button>
          </div>
        </section>
          </>
        )}

        {/* TAB: MATRIX (15-LAYER BINARY MATRIX + SEARCH) */}
        {bottomTab === 'matrix' && (
          <Dashboard2MatrixPanel
            displayId={effectiveMainId}
            currentRank={currentRank}
            initialRank={
              matrixTargetRank ?? (isViewingSubId ? selectedSubIdTarget!.rank : 1)
            }
            initialRootNodeId={
              matrixTargetRootNodeId ?? (isViewingSubId ? selectedSubIdTarget!.nodeId : null)
            }
            focusVersion={matrixFocusVersion}
            rankCounts={rankCounts}
            contractAddress={contractAddress}
            refreshTrigger={refreshTrigger}
            activeIdSummary={matrixActiveIdSummary}
            allReports={reports}
            onBackToHome={() => setBottomTab('home')}
            onBackToMainId={
              isViewingSubId
                ? () => {
                    setSelectedSubIdTarget(null);
                    setMatrixTargetRootNodeId(null);
                    setMatrixTargetRank(undefined);
                    setMatrixFocusVersion((v) => v + 1);
                    onSelectMainId(String(effectiveMainId));
                  }
                : undefined
            }
            onOpenUpgradeModal={!isViewingSubId ? () => setActiveModal('upgrade') : undefined}
            onSelectMainId={(idStr) => {
              setSelectedSubIdTarget(null);
              setMatrixTargetRootNodeId(null);
              onSelectMainId(idStr);
              setBottomTab('home');
            }}
            onSelectSubId={(target) => {
              setSelectedSubIdTarget(target);
              setMatrixTargetRootNodeId(target.nodeId);
              setMatrixTargetRank(target.rank);
              setMatrixFocusVersion((v) => v + 1);
              setBottomTab('home');
            }}
            onOpenFullMatrixCanvas={(targetRank) => onOpenMatrixTree(targetRank)}
            onOpenSwitchId={() => setActiveModal('switch_id')}
            account={account}
            language={language}
            theme={theme}
            onRefreshNotifications={handleRefreshAll}
          />
        )}

        {/* TAB: UNILEVEL 15 LAYERS (DIRECT SPONSOR GENEALOGY TREE) */}
        {bottomTab === 'unilevel' && (
          <Dashboard2UnilevelPanel
            displayId={effectiveMainId}
            currentRank={currentRank}
            initialRootId={unilevelTargetRootId}
            focusVersion={unilevelFocusVersion}
            rankCounts={rankCounts}
            contractAddress={contractAddress}
            refreshTrigger={refreshTrigger}
            activeIdSummary={matrixActiveIdSummary}
            allReports={reports}
            onBackToHome={() => setBottomTab('home')}
            onOpenMatrixForId={(targetMainId, targetRank) => {
              setSelectedSubIdTarget(null);
              onSelectMainId(String(targetMainId));
              openDashboard2Matrix(targetRank ?? 1, targetMainId);
            }}
            onSelectMainId={(idStr) => {
              setSelectedSubIdTarget(null);
              setMatrixTargetRootNodeId(null);
              onSelectMainId(idStr);
              setBottomTab('home');
            }}
            onOpenSwitchId={() => setActiveModal('switch_id')}
            account={account}
            language={language}
            theme={theme}
            onRefreshNotifications={handleRefreshAll}
          />
        )}

        {/* TAB: ID VAULT (คลังไอดีทั้งหมด: Main ID / Auto ID / Extra ID / โคลนนิ่ง) */}
        {bottomTab === 'id_vault' && (
          <Dashboard2IdVaultPanel
            account={account}
            usdtBalance={usdtBalance}
            bnbBalance={bnbBalance}
            profile={profile}
            reports={reports}
            displayId={displayId}
            effectiveMainId={effectiveMainId}
            selectedSubIdTarget={selectedSubIdTarget}
            isSyncing={isSyncing}
            language={language}
            theme={theme}
            onRefresh={handleRefreshAll}
            onConnectWallet={onConnectWallet}
            onOpenRegisterModal={onOpenRegisterModal}
            onBackToHome={() => setBottomTab('home')}
            onSelectMainId={(mainId) => {
              setSelectedSubIdTarget(null);
              setMatrixTargetRootNodeId(null);
              setMatrixTargetRank(undefined);
              setMatrixFocusVersion((v) => v + 1);
              onSelectMainId(String(mainId));
              setBottomTab('history');
            }}
            onSelectSubId={(target) => {
              setSelectedSubIdTarget(target);
              onSelectMainId(String(target.mainId));
              setMatrixTargetRank(target.rank);
              setMatrixTargetRootNodeId(target.nodeId);
              setMatrixFocusVersion((v) => v + 1);
              setBottomTab('history');
            }}
            onOpenMatrixForNode={(targetRank, nodeId, subTarget) => {
              if (subTarget) {
                setSelectedSubIdTarget(subTarget);
                onSelectMainId(String(subTarget.mainId));
              } else {
                setSelectedSubIdTarget(null);
                onSelectMainId(String(nodeId));
              }
              openDashboard2Matrix(targetRank, nodeId);
            }}
            onOpenUnilevelForNode={(nodeId, mainId, subTarget) => {
              if (subTarget) {
                setSelectedSubIdTarget(subTarget);
                onSelectMainId(String(subTarget.mainId));
                openDashboard2Unilevel(nodeId);
              } else {
                setSelectedSubIdTarget(null);
                onSelectMainId(String(mainId));
                openDashboard2Unilevel(mainId);
              }
            }}
            onOpenUpgradeForMainId={(mainId) => {
              setSelectedSubIdTarget(null);
              onSelectMainId(String(mainId));
              setActiveModal('upgrade');
            }}
          />
        )}

        {/* TAB: HOME (DASHBOARD OVERVIEW — MOBILE & PC CLEAN HIERARCHY) */}
        {bottomTab === 'home' && (
          <>
            {/* 3. 3 SUMMARY STATS CARDS (2-COL + FULL-WIDTH TOP ON MOBILE, 3-COL ON SM+/PC) */}
            <section className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3.5 mx-0.5 sm:mx-1">
              <article
                onClick={() => {
                  setIncomeModalFilter('all');
                  setIncomeModalRankFilter('all');
                  setActiveModal('income');
                }}
                className="col-span-2 sm:col-span-1 min-w-0 p-3.5 sm:p-4 rounded-[21px] bg-gradient-to-br from-white to-[#d8f0ff] border-[1.5px] border-[#a8dfff] shadow-[0_8px_22px_rgba(0,72,190,0.23)] cursor-pointer hover:border-[#087cf4] hover:-translate-y-0.5 transition-transform duration-150 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[22px] sm:text-[26px] text-[#087cf4] leading-none">▰</span>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#e3f4ff] text-[#0754b9] border border-[#b4e0ff]">
                    รายละเอียด ›
                  </span>
                </div>
                <div className="mt-2">
                  <label className="block text-[11px] sm:text-[12px] font-bold text-[#09265f]">
                    รายได้ทั้งหมด
                  </label>
                  <strong className="block text-[24px] sm:text-[28px] leading-[1.15] my-1 tracking-tight text-[#09265f] font-black font-mono tabular-nums truncate">
                    {totalIncomeUsdt.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                  <small className="block text-[10.5px] sm:text-[11px] font-bold text-[#0c559f] truncate">
                    USDT (แนะนำ {direct30Total.toFixed(1)} + ชั้น {level30Total.toFixed(1)})
                  </small>
                </div>
              </article>

              <article
                onClick={() => {
                  setMembersSelectedRank('all');
                  setActiveModal('members');
                }}
                className="min-w-0 p-3.5 sm:p-4 rounded-[21px] bg-gradient-to-br from-white to-[#d8f0ff] border-[1.5px] border-[#a8dfff] shadow-[0_8px_22px_rgba(0,72,190,0.23)] cursor-pointer hover:border-[#087cf4] hover:-translate-y-0.5 transition-transform duration-150 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[22px] sm:text-[26px] text-[#087cf4] leading-none">👥</span>
                  <span className="hidden xs:inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#e3f4ff] text-[#0754b9] border border-[#b4e0ff]">
                    รายชื่อ ›
                  </span>
                </div>
                <div className="mt-2">
                  <label className="block text-[11px] sm:text-[12px] font-bold text-[#09265f] truncate">
                    สมาชิก (ID #{displayId})
                  </label>
                  <strong className="block text-[22px] sm:text-[28px] leading-[1.15] my-1 tracking-tight text-[#09265f] font-black font-mono tabular-nums">
                    {activeMembersData
                      ? Number(activeMembersData.summary?.totalAllMembersAcrossRanks ?? 0).toLocaleString()
                      : membersLoading
                      ? '...'
                      : totalMembersR1.toLocaleString()}
                  </strong>
                  <small className="block text-[10px] sm:text-[11px] font-bold text-[#0c559f] truncate">
                    {activeMembersData
                      ? `${activeMembersData.summary?.totalUniqueMemberMainIds ?? 0} รหัส · ตรง ${
                          activeMembersData.summary?.totalDirectMainIds ?? directMainIdsList.length
                        }`
                      : `ลูกตรง ${directMainIdsList.length} IDs`}
                  </small>
                </div>
              </article>

              <article
                onClick={() => setActiveModal('vault')}
                className="min-w-0 p-3.5 sm:p-4 rounded-[21px] bg-gradient-to-br from-white to-[#d8f0ff] border-[1.5px] border-[#a8dfff] shadow-[0_8px_22px_rgba(0,72,190,0.23)] cursor-pointer hover:border-[#087cf4] hover:-translate-y-0.5 transition-transform duration-150 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[22px] sm:text-[26px] text-[#087cf4] leading-none">▣</span>
                  <span className="hidden xs:inline-block text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#e3f4ff] text-[#0754b9] border border-[#b4e0ff]">
                    Vault ›
                  </span>
                </div>
                <div className="mt-2">
                  <label className="block text-[11px] sm:text-[12px] font-bold text-[#09265f] truncate">
                    ยอดคงเหลือ Vault
                  </label>
                  <strong className="block text-[22px] sm:text-[28px] leading-[1.15] my-1 tracking-tight text-[#09265f] font-black font-mono tabular-nums truncate">
                    {vaultPools.totalRemaining.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                  <small className="block text-[10px] sm:text-[11px] font-bold text-[#0c559f] truncate">
                    USDT (สะสมรวม {vaultPools.grossTotal.toFixed(1)})
                  </small>
                </div>
              </article>
            </section>

            {/* 4. QUICK MAIN MENU (8 BALANCED ACTION SHORTCUTS — 2x4 MOBILE / 4x2 SM+) */}
            <section className="mx-0.5 sm:mx-1 p-3.5 sm:p-4 rounded-[24px] bg-gradient-to-br from-white/95 to-[#dff4ff]/95 border-[1.5px] border-[#a9ddff] shadow-[0_8px_22px_rgba(0,72,190,0.23)]">
              <div className="flex items-center justify-between gap-2 mb-2.5 sm:mb-3 px-0.5">
                <h2 className="text-[15px] sm:text-[17px] font-black text-[#09265f] m-0">
                  ⚡ เมนูหลัก
                </h2>
                <span className="text-[11px] font-bold text-[#0756bc]">ทางลัดจัดการบัญชี</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setMembersSelectedRank('all');
                    setMembersScope('all');
                    setMembersSearch('');
                    setActiveModal('members');
                  }}
                  className="p-2.5 sm:p-3 text-center rounded-[16px] sm:rounded-[18px] bg-gradient-to-br from-white to-[#d5edff] border border-[#a7d8ff] shadow-[0_4px_12px_rgba(7,86,165,0.14)] text-[11px] sm:text-xs font-black text-[#09265f] hover:border-[#087cf4] hover:-translate-y-0.5 transition-transform duration-150 cursor-pointer"
                >
                  <b className="block text-[24px] sm:text-[26px] text-[#087cf4] mb-1 leading-none">👥</b>
                  <span className="block truncate">สมาชิก/ลูกตรง</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    isViewingSubId
                      ? openDashboard2Matrix(selectedSubIdTarget!.rank, selectedSubIdTarget!.nodeId)
                      : openDashboard2Matrix(1)
                  }
                  className="p-2.5 sm:p-3 text-center rounded-[16px] sm:rounded-[18px] bg-gradient-to-br from-white to-[#d5edff] border border-[#a7d8ff] shadow-[0_4px_12px_rgba(7,86,165,0.14)] text-[11px] sm:text-xs font-black text-[#09265f] hover:border-[#087cf4] hover:-translate-y-0.5 transition-transform duration-150 cursor-pointer"
                >
                  <b className="block text-[24px] sm:text-[26px] text-[#087cf4] mb-1 leading-none">⌘</b>
                  <span className="block truncate">ผัง Matrix</span>
                </button>

                <button
                  type="button"
                  onClick={() => openDashboard2Unilevel(effectiveMainId)}
                  className="p-2.5 sm:p-3 text-center rounded-[16px] sm:rounded-[18px] bg-gradient-to-br from-white to-[#d5edff] border border-[#a7d8ff] shadow-[0_4px_12px_rgba(7,86,165,0.14)] text-[11px] sm:text-xs font-black text-[#09265f] hover:border-[#087cf4] hover:-translate-y-0.5 transition-transform duration-150 cursor-pointer"
                >
                  <b className="block text-[24px] sm:text-[26px] text-emerald-600 mb-1 leading-none">❖</b>
                  <span className="block truncate">ผัง ยูนิ15ชั้น</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveModal('upgrade')}
                  className="p-2.5 sm:p-3 text-center rounded-[16px] sm:rounded-[18px] bg-gradient-to-br from-white to-[#d5edff] border border-[#a7d8ff] shadow-[0_4px_12px_rgba(7,86,165,0.14)] text-[11px] sm:text-xs font-black text-[#09265f] hover:border-[#087cf4] hover:-translate-y-0.5 transition-transform duration-150 cursor-pointer"
                >
                  <b className="block text-[24px] sm:text-[26px] text-[#087cf4] mb-1 leading-none">📈</b>
                  <span className="block truncate">อัปเกรด Rank</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveModal('wallet')}
                  className="p-2.5 sm:p-3 text-center rounded-[16px] sm:rounded-[18px] bg-gradient-to-br from-white to-[#d5edff] border border-[#a7d8ff] shadow-[0_4px_12px_rgba(7,86,165,0.14)] text-[11px] sm:text-xs font-black text-[#09265f] hover:border-[#087cf4] hover:-translate-y-0.5 transition-transform duration-150 cursor-pointer"
                >
                  <b className="block text-[24px] sm:text-[26px] text-[#087cf4] mb-1 leading-none">▰</b>
                  <span className="block truncate">กระเป๋าเงิน</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveModal('vault')}
                  className="p-2.5 sm:p-3 text-center rounded-[16px] sm:rounded-[18px] bg-gradient-to-br from-white to-[#d5edff] border border-[#a7d8ff] shadow-[0_4px_12px_rgba(7,86,165,0.14)] text-[11px] sm:text-xs font-black text-[#09265f] hover:border-[#087cf4] hover:-translate-y-0.5 transition-transform duration-150 cursor-pointer"
                >
                  <b className="block text-[24px] sm:text-[26px] text-[#087cf4] mb-1 leading-none">▣</b>
                  <span className="block truncate">Vault</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveModal('allsell')}
                  className="p-2.5 sm:p-3 text-center rounded-[16px] sm:rounded-[18px] bg-gradient-to-br from-white to-[#d5edff] border border-[#a7d8ff] shadow-[0_4px_12px_rgba(7,86,165,0.14)] text-[11px] sm:text-xs font-black text-[#09265f] hover:border-[#087cf4] hover:-translate-y-0.5 transition-transform duration-150 cursor-pointer"
                >
                  <b className="block text-[24px] sm:text-[26px] text-[#087cf4] mb-1 leading-none">🎁</b>
                  <span className="block truncate">AllSell Pool</span>
                </button>

                <button
                  type="button"
                  onClick={() => setBottomTab('history')}
                  className="p-2.5 sm:p-3 text-center rounded-[16px] sm:rounded-[18px] bg-gradient-to-br from-white to-[#d5edff] border border-[#a7d8ff] shadow-[0_4px_12px_rgba(7,86,165,0.14)] text-[11px] sm:text-xs font-black text-[#09265f] hover:border-[#087cf4] hover:-translate-y-0.5 transition-transform duration-150 cursor-pointer"
                >
                  <b className="block text-[24px] sm:text-[26px] text-[#087cf4] mb-1 leading-none">▥</b>
                  <span className="block truncate">ประวัติรายรับ</span>
                </button>
              </div>
            </section>

            {/* 5. PC 2-COLUMN OVERVIEW ROW: RANK HERO BANNER + REFERRAL LINK CARD */}
            <div className="mx-0.5 sm:mx-1 grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
              {/* RANK HERO BANNER */}
              <section className="lg:col-span-7 rounded-[23px] p-4 sm:p-5 text-white bg-[radial-gradient(circle_at_16%_50%,#1168d9,#061d68_47%,#063f9f)] shadow-[0_7px_22px_rgba(3,67,164,0.47)] flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-5 border border-[#42bfff]">
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  <div className="text-[40px] sm:text-[48px] drop-shadow-[0_0_7px_#ffdc5a] shrink-0">
                    🏆
                  </div>

                  <div className="flex-1 min-w-0">
                    <small className="block text-[11px] sm:text-[12px] text-[#d7f3ff]">
                      ระดับปัจจุบันของคุณ
                    </small>
                    <strong className="block text-[26px] sm:text-[32px] leading-[1.05] text-[#fff2a4] font-black">
                      RANK {currentRank}
                    </strong>
                    <em className="not-italic text-[10.5px] sm:text-[11px] text-cyan-200 block mt-0.5">
                      FRACTAL FLOW MATRIX 18 · โคลน {totalClones} ใบ
                    </em>
                  </div>
                </div>

                <div className="w-full sm:w-[44%] font-bold text-[11px] sm:text-[12px] pt-2.5 sm:pt-0 border-t sm:border-t-0 border-white/15">
                  <div className="flex items-center justify-between mb-1">
                    <span>ความคืบหน้า Rank 1–18</span>
                    <span className="text-[#fff2a4] font-mono">{overallRankPct}%</span>
                  </div>
                  <SvgProgressBar
                    percent={overallRankPct}
                    variant="gold"
                    heightClass="h-3.5"
                    trackClass="bg-[#164c93] border border-[#77cfff]"
                  />
                  <small className="block mt-1.5 text-[10.5px] text-[#d7f3ff] truncate">
                    {currentRank >= 18
                      ? 'ปลดล็อกครบสูงสุด 18 Rank แล้ว'
                      : `เป้าหมายถัดไป: R${nextRank} (${nextRankPrice.toLocaleString()} U)`}
                  </small>
                </div>
              </section>

              {/* REFERRAL CARD */}
              <section className="lg:col-span-5 p-4 rounded-[23px] bg-gradient-to-br from-white/95 to-[#d7f0ff]/95 border-[1.5px] border-[#a8ddff] shadow-[0_8px_22px_rgba(0,72,190,0.23)] flex flex-col justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="text-[24px] text-[#087cf4] leading-none shrink-0">🔗</span>
                  <div className="min-w-0">
                    <strong className="block text-[14px] sm:text-[15px] font-extrabold text-[#09265f] truncate">
                      ลิงก์ผู้แนะนำของคุณ (ID #{displayId})
                    </strong>
                    <small className="block text-[11px] text-[#58769e]">
                      ส่งลิงก์นี้ให้สมาชิกใหม่สมัครภายใต้รหัสแนะนำของคุณ
                    </small>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    readOnly
                    value={referralUrl}
                    aria-label="ลิงก์ผู้แนะนำ"
                    className="min-w-0 flex-1 border border-[#a9d7ff] rounded-[12px] bg-[#f7fcff] px-3 py-2.5 text-[#17477e] text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleCopyReferral}
                    className="border-0 rounded-[12px] px-4 py-2.5 sm:py-2 text-white font-bold text-xs bg-gradient-to-br from-[#24caff] to-[#0754d2] shadow-[0_4px_12px_rgba(8,124,244,0.33)] hover:brightness-105 transition cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0"
                  >
                    {copiedRef ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedRef ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}</span>
                  </button>
                </div>

                <div className="text-[10.5px] text-[#55769b] truncate">
                  {refStatusText ||
                    `รหัสผู้แนะนำ: ID #${displayId} · ลิงก์นี้ใช้โดเมนของเว็บไซต์ที่เปิดอยู่`}
                </div>
              </section>
            </div>

            {/* 6. MY VAULT — 3 SMART POOLS */}
            <section className="mx-0.5 sm:mx-1 p-3.5 sm:p-4 rounded-[24px] bg-gradient-to-br from-white/95 to-[#dff4ff]/95 border-[1.5px] border-[#a9ddff] shadow-[0_8px_22px_rgba(0,72,190,0.23)]">
              <h2 className="flex items-center justify-between gap-2 mb-3 px-0.5 text-[15px] sm:text-[18px] font-black text-[#09265f]">
                <span>🛡 ถังสะสมเงิน (My Vault)</span>
                <button
                  type="button"
                  onClick={() => openVaultModal('all')}
                  className="text-xs font-bold text-[#0756bc] hover:underline cursor-pointer"
                >
                  สมุดบัญชี Vault ›
                </button>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                <article
                  onClick={() => openVaultModal('upgrade')}
                  className="p-3.5 sm:p-4 rounded-[20px] text-center bg-gradient-to-br from-[#f4fcff] to-[#cce8ff] border border-[#a8d9ff] shadow-[0_4px_13px_rgba(11,115,197,0.16)] cursor-pointer hover:scale-[1.01] transition-transform duration-150 flex flex-col justify-between"
                >
                  <div>
                    <div className="text-[26px] sm:text-[29px]">🚀</div>
                    <h3 className="text-[12px] sm:text-[13px] font-bold leading-snug my-1 text-[#09265f]">
                      อัพเกรด Rank
                    </h3>
                    <strong className="text-[20px] sm:text-[22px] font-black block text-[#09265f] font-mono tabular-nums">
                      {vaultPools.upgradeRankPool.toFixed(2)}
                    </strong>
                    <small className="text-[10.5px] font-bold text-[#0c559f] block">
                      {currentRank >= 18
                        ? 'USDT (Max R18)'
                        : `USDT / เป้า R${nextRank}: ${nextRankPrice} U`}
                    </small>
                    <div className="mt-2">
                      <SvgProgressBar percent={upgradePoolPct} variant="sky" heightClass="h-2" />
                    </div>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-[#b5dcfa] flex items-center justify-between text-[10.5px] font-bold text-[#0754b9]">
                    <span>ใช้ไป {vaultPools.upgradesDeductedUsdt.toFixed(2)} U</span>
                    <span className="underline">ดูสมุดบัญชี ›</span>
                  </div>
                </article>

                <article
                  onClick={() => openVaultModal('auto_id')}
                  className="p-3.5 sm:p-4 rounded-[20px] text-center bg-gradient-to-br from-[#eafff4] to-[#bdf5dc] border border-[#9ce9c5] shadow-[0_4px_13px_rgba(11,115,197,0.16)] cursor-pointer hover:scale-[1.01] transition-transform duration-150 flex flex-col justify-between"
                >
                  <div>
                    <div className="text-[26px] sm:text-[29px]">👤</div>
                    <h3 className="text-[12px] sm:text-[13px] font-bold leading-snug my-1 text-[#09265f]">
                      Auto ID
                    </h3>
                    <strong className="text-[20px] sm:text-[22px] font-black block text-[#09265f] font-mono tabular-nums">
                      {vaultPools.newAutoIdPool.toFixed(2)}
                    </strong>
                    <small className="text-[10.5px] font-bold text-[#0f6b47] block">
                      USDT คงเหลือ (ครบ 5 U แตก 1 รหัส)
                    </small>
                    <div className="mt-2">
                      <SvgProgressBar
                        percent={autoPoolPct}
                        variant="emerald"
                        heightClass="h-2"
                        trackClass="bg-[#a7e6c9]"
                      />
                    </div>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-[#97dfc0] space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-black text-[#0a5c3c]">
                      <span>จำนวนรหัส: {totalAutoIds} รหัส</span>
                      <span>ใช้ {vaultPools.autoIdsDeductedUsdt.toFixed(2)} U</span>
                    </div>
                    <div className="text-[10.5px] font-bold text-[#0f6b47] underline">
                      คลิกดูรายชื่อ {totalAutoIds} รหัส Auto ID ›
                    </div>
                  </div>
                </article>

                <article
                  onClick={() => openVaultModal('extra_id')}
                  className="p-3.5 sm:p-4 rounded-[20px] text-center bg-gradient-to-br from-[#fbf5ff] to-[#e0ccff] border border-[#d4b8ff] shadow-[0_4px_13px_rgba(11,115,197,0.16)] cursor-pointer hover:scale-[1.01] transition-transform duration-150 flex flex-col justify-between"
                >
                  <div>
                    <div className="text-[26px] sm:text-[29px]">✦</div>
                    <h3 className="text-[12px] sm:text-[13px] font-bold leading-snug my-1 text-[#09265f]">
                      Extra ID
                    </h3>
                    <strong className="text-[20px] sm:text-[22px] font-black block text-[#09265f] font-mono tabular-nums">
                      {vaultPools.newExtraIdPool.toFixed(2)}
                    </strong>
                    <small className="text-[10.5px] font-bold text-[#5b21b6] block">
                      USDT คงเหลือ (สะสมรวม {vaultPools.newExtraIdPoolGross.toFixed(2)} U)
                    </small>
                    <div className="mt-2">
                      <SvgProgressBar
                        percent={extraPoolPct}
                        variant="purple"
                        heightClass="h-2"
                        trackClass="bg-[#ccb3f7]"
                      />
                    </div>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-[#cbaef9] space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-black text-[#4c1d95]">
                      <span>จำนวนรหัส: {totalExtraIds} รหัส</span>
                      <span>ใช้ {vaultPools.extraIdsDeductedUsdt.toFixed(2)} U</span>
                    </div>
                    <div className="text-[10.5px] font-bold text-[#5b21b6] underline">
                      คลิกดูรายชื่อ {totalExtraIds} รหัส Extra ID ›
                    </div>
                  </div>
                </article>
              </div>
            </section>

            {/* 7. 18-RANK MEMBER TABLE (MOBILE SUMMARY + POPUP / TABLET 3-COL / PC 6-COL) */}
            {(() => {
              const currentPriceUsdt = RANK_PRICES_USDT[currentRank - 1] || 5;
              const currentSystemNodes = Number(rankCounts[currentRank] ?? 0);
              const currentIdRankObj = idMembersByRank.get(currentRank);
              const currentIdMembers = currentIdRankObj
                ? Number(currentIdRankObj.totalMembersInRank ?? 0)
                : null;
              const currentReq = ALLSELL_DIRECT_REQUIREMENTS[currentRank];
              const currentMatchingPool = allSellPools.find(
                (p) => Number(p.targetRank) === currentRank
              );

              return (
                <section className="mx-0.5 sm:mx-1 p-3.5 sm:p-4 rounded-[24px] bg-gradient-to-br from-white/95 to-[#dff4ff]/95 border-[1.5px] border-[#a9ddff] shadow-[0_8px_22px_rgba(0,72,190,0.23)]">
                  <h2 className="flex items-center justify-between gap-2 mb-3 px-0.5 text-[15px] sm:text-[18px] font-black text-[#09265f] flex-wrap">
                    <span>👑 ตารางสมาชิกครบ 18 RANK (ID #{displayId})</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMembersSelectedRank('all');
                          setActiveModal('members');
                        }}
                        className="px-2.5 py-1 rounded-xl bg-white border border-[#9fd4ff] text-[11px] font-bold text-[#0756bc] hover:bg-[#eef8ff] cursor-pointer"
                      >
                        👥 ดูสมาชิกแยก Rank ›
                      </button>
                      <span className="text-xs font-bold text-[#0756bc]">RANK 1–18</span>
                    </div>
                  </h2>

                  {/* MOBILE (< 640px): COMPACT CURRENT RANK SUMMARY + POPUP TRIGGER */}
                  <div className="sm:hidden space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[#3f6493] px-0.5 tabular-nums">
                      <span>ปลดล็อกแล้ว {currentRank} / 18 Rank</span>
                      <span>Rank ปัจจุบัน: R{currentRank}</span>
                    </div>

                    <article
                      onClick={() => openDashboard2Matrix(currentRank)}
                      className="rounded-[18px] p-3.5 bg-gradient-to-br from-[#087cf4] to-[#0646b3] border border-[#5ddcff] text-white shadow-[0_5px_14px_rgba(8,101,215,0.42)] cursor-pointer active:scale-[0.99] transition-transform"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <b className="text-[16px] font-black tabular-nums">RANK {currentRank}</b>
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-[10px] bg-[#ffdf6d] text-[#173b77]">
                            CURRENT
                          </span>
                        </div>
                        <span className="text-xs font-bold text-cyan-100 underline">
                          เปิดผัง R{currentRank} ›
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px] text-[#e3f6ff] tabular-nums">
                        <div>
                          ราคา:{' '}
                          <strong className="text-white">
                            {currentPriceUsdt.toLocaleString()} U
                          </strong>
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <span>
                            สมาชิก ID นี้:{' '}
                            <strong className="text-[#ffdf6d]">
                              {currentIdMembers !== null ? currentIdMembers : currentSystemNodes}
                            </strong>
                          </span>
                          {currentIdMembers !== null && currentIdMembers > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMembersSelectedRank(currentRank);
                                setActiveModal('members');
                              }}
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold underline text-cyan-100 cursor-pointer"
                            >
                              ดูรายชื่อ
                            </button>
                          )}
                        </div>
                        <div>
                          ทั้งระบบ:{' '}
                          <strong className="text-white">{currentSystemNodes} โหนด</strong>
                        </div>
                        <div>
                          Direct Sponsor:{' '}
                          <strong className="text-[#ffdf6d]">
                            {currentReq
                              ? currentMatchingPool
                                ? `${currentMatchingPool.qualifiedDirectCount}/${currentReq.count} IDs*`
                                : currentReq.label
                              : 'ไม่กำหนด'}
                          </strong>
                        </div>
                      </div>
                    </article>

                    <button
                      type="button"
                      onClick={() => setActiveModal('ranks_18')}
                      className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#23caff] via-[#087cf4] to-[#0755d7] text-white text-[13px] font-black shadow-[0_6px_16px_rgba(7,85,215,0.32)] hover:brightness-105 active:scale-[0.99] transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>เปิดดูตารางครบ 18 Rank (R1–R18)</span>
                      <span className="text-base leading-none">›</span>
                    </button>
                  </div>

                  {/* TABLET & DESKTOP (>= 640px): FULL INLINE 18-RANK GRID */}
                  <div className="hidden sm:grid sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    {Array.from({ length: 18 }, (_, i) => i + 1).map((n) =>
                      renderRankCard(n, 'inline')
                    )}
                  </div>

                  <p className="hidden sm:block text-[10px] text-[#54759c] leading-relaxed mt-2.5">
                    สมาชิกใน Rank = จำนวนโหนดจริงใน Rank นั้นจากระบบ · Direct Sponsor (*) = เกณฑ์ผู้แนะนำตรงสำหรับสิทธิ์รับกองทุน AllSell (R11: 5 IDs ใน R8-11 · R14: 2 IDs ใน R12-14 · R16: 2 IDs ใน R14-16 · R18: 5 IDs ใน R16-18 โดยต้องผ่านเกณฑ์กองที่ 1 ก่อน) · กดที่การ์ด Rank เพื่อเปิดดูผัง Matrix ของ Rank นั้น
                  </p>
                </section>
              );
            })()}

            {/* 8. FOOTER BANNER */}
            <div className="mx-0.5 sm:mx-1 p-4 text-center text-white rounded-[20px] bg-[radial-gradient(circle_at_20%_50%,#168be9,#041b61_70%)] shadow-[0_8px_22px_rgba(0,72,190,0.23)] font-bold">
              <div className="flex justify-center">
                <FractalFlowBrandCard size="md" />
              </div>
              <strong className="text-[16px] sm:text-[17px] text-[#ffe57d] block mt-2">
                “เติบโตไปด้วยกัน สู่ความสำเร็จที่ยิ่งใหญ่”
              </strong>
            </div>
          </>
        )}

        {/* TAB: HISTORY (INCOME, UPGRADES, AUTO ID & EXTRA ID FOR SELECTED ID) */}
        {bottomTab === 'history' && (
          <section className="mx-0.5 sm:mx-1 p-3 sm:p-4 rounded-[24px] bg-gradient-to-br from-white/95 to-[#dff4ff]/95 border-[1.5px] border-[#a9ddff] shadow-[0_8px_22px_rgba(0,72,190,0.23)] space-y-3 min-w-0">
            {/* Header + ID Switcher + Refresh */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-base sm:text-lg font-black text-[#09265f] flex items-center gap-2 flex-wrap">
                  <span>▥ ประวัติรายได้ & กิจกรรมของ ID #{displayId}</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      activeReport?.isAutoId
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-[#d7efff] text-[#0754b9] border border-[#96d2ff]'
                    }`}
                  >
                    {activeReport?.isAutoId ? 'AUTO ID' : 'MAIN ID'} · Rank {currentRank}
                  </span>
                </h2>
                <p className="text-[11px] font-semibold text-[#3f6493]">
                  อ้างอิงตามบัญชี ID #{displayId} (ผู้แนะนำ #{activeReport?.directSponsorNodeId || 1}) · 30% แนะนำ · 30% ค่าชั้น · 35% Vault · อัพ Rank · Auto ID & Extra ID
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setActiveModal('switch_id')}
                  className="px-2.5 py-1.5 rounded-xl bg-white border border-[#96d2ff] text-xs font-bold text-[#0756bc] hover:bg-[#eef8ff] cursor-pointer"
                >
                  ⇄ สลับ ID (#{displayId})
                </button>
                <button
                  type="button"
                  onClick={fetchDashboardData}
                  className="px-2.5 py-1.5 rounded-xl bg-[#087cf4] text-white text-xs font-bold hover:bg-[#0569d4] inline-flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  รีเฟรช
                </button>
              </div>
            </div>

            {/* Summary Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 rounded-xl bg-emerald-50/90 border border-emerald-200">
                <div className="text-[10px] font-bold text-emerald-700">30% แนะนำตรง</div>
                <div className="text-sm font-black text-emerald-800 font-mono">
                  +{historyCounts.totals.direct.toFixed(2)} U
                </div>
                <div className="text-[10px] text-emerald-600 font-semibold">
                  {historyCounts.counts.direct} รายการ
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-cyan-50/90 border border-cyan-200">
                <div className="text-[10px] font-bold text-cyan-700">30% ค่าชั้น</div>
                <div className="text-sm font-black text-cyan-800 font-mono">
                  +{historyCounts.totals.level.toFixed(2)} U
                </div>
                <div className="text-[10px] text-cyan-600 font-semibold">
                  {historyCounts.counts.level} รายการ
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-indigo-50/90 border border-indigo-200">
                <div className="text-[10px] font-bold text-indigo-700">35% เข้า Vault</div>
                <div className="text-sm font-black text-indigo-800 font-mono">
                  +{historyCounts.totals.vault.toFixed(2)} U
                </div>
                <div className="text-[10px] text-indigo-600 font-semibold">
                  {historyCounts.counts.vault} รายการ
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-violet-50/90 border border-violet-200">
                <div className="text-[10px] font-bold text-violet-700">อัพ Rank / สร้าง ID</div>
                <div className="text-xs font-black text-violet-900 leading-snug mt-0.5">
                  อัพ {historyCounts.counts.upgrade} · Auto {historyCounts.counts.auto_id} · Extra{' '}
                  {historyCounts.counts.extra_id}
                </div>
                <div className="text-[10px] text-violet-600 font-semibold">
                  ทั้งหมด {historyCounts.counts.all} รายการ
                </div>
              </div>
            </div>

            {/* Category Filter Chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {(
                [
                  { key: 'all', label: 'ทั้งหมด' },
                  { key: 'direct', label: '30% แนะนำ' },
                  { key: 'level', label: '30% ค่าชั้น' },
                  { key: 'vault', label: '35% Vault' },
                  { key: 'upgrade', label: 'อัพ Rank' },
                  { key: 'auto_id', label: 'Auto ID' },
                  { key: 'extra_id', label: 'Extra ID' },
                  { key: 'registration', label: 'เปิด ID' },
                ] as const
              ).map((item) => {
                const active = historyFilter === item.key;
                const count = historyCounts.counts[item.key];
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setHistoryFilter(item.key)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition cursor-pointer inline-flex items-center gap-1 ${
                      active
                        ? 'bg-[#087cf4] text-white shadow-sm'
                        : 'bg-white text-[#0756bc] border border-[#a9ddff] hover:bg-[#eef8ff]'
                    }`}
                  >
                    <span>{item.label}</span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                        active ? 'bg-white/25 text-white' : 'bg-[#e3f4ff] text-[#0756bc]'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Rank 1–18 Drop Down Filter */}
            <div ref={historyRankDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setIsHistoryRankDropdownOpen((prev) => !prev)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-left cursor-pointer transition ${
                  historyRankFilter !== 'all'
                    ? 'bg-gradient-to-r from-[#eff8ff] to-[#ddf0ff] border-[#5fb8ff] text-[#09265f]'
                    : 'bg-white/95 border-[#a9ddff] text-[#09265f] hover:bg-[#f4faff]'
                }`}
                aria-expanded={isHistoryRankDropdownOpen}
              >
                <div className="flex items-center gap-2 min-w-0 flex-wrap text-xs">
                  <span className="px-2 py-0.5 rounded-lg bg-[#087cf4] text-white text-[11px] font-black">
                    {historyRankFilter === 'all' ? 'ทุก Rank (1–18)' : `Rank ${historyRankFilter}`}
                  </span>
                  <span className="font-bold text-[#0754b9] truncate">
                    {historyRankFilter === 'all'
                      ? `แสดงรายได้ทุก Rank (${historyRankStats.totalCount} รายการ · +${historyRankStats.totalIncomeUsdt.toFixed(2)} U)`
                      : `กรองเฉพาะ Rank ${historyRankFilter} (${historyRankStats.byRank[historyRankFilter]?.count || 0} รายการ · +${(historyRankStats.byRank[historyRankFilter]?.incomeUsdt || 0).toFixed(2)} U)`}
                  </span>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-[#0754b9] shrink-0 transition-transform duration-150 ${
                    isHistoryRankDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isHistoryRankDropdownOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-2xl bg-white border-2 border-[#8ecbff] shadow-[0_14px_34px_rgba(7,85,181,0.25)] overflow-hidden">
                  <div className="px-3 py-2 bg-[#eff8ff] border-b border-[#cbe7ff] flex items-center justify-between text-[10.5px] font-bold text-[#0754b9]">
                    <span>เลือกกรองประวัติรายได้ตาม Rank (1–18)</span>
                    <span>แตะเพื่อเลือก</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-1.5 space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryRankFilter('all');
                        setIsHistoryRankDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-left text-xs cursor-pointer ${
                        historyRankFilter === 'all'
                          ? 'bg-gradient-to-r from-[#087cf4] to-[#0648b2] text-white font-bold'
                          : 'bg-[#f5fbff] hover:bg-[#e2f2ff] text-[#09265f] font-semibold'
                      }`}
                    >
                      <span>ทั้งหมด (ทุก Rank 1–18)</span>
                      <span
                        className={`font-mono text-[11px] font-bold ${
                          historyRankFilter === 'all' ? 'text-cyan-100' : 'text-[#0754b9]'
                        }`}
                      >
                        {historyRankStats.totalCount} รายการ · +{historyRankStats.totalIncomeUsdt.toFixed(2)} U
                      </span>
                    </button>

                    {Array.from({ length: 18 }, (_, i) => i + 1).map((r) => {
                      const active = historyRankFilter === r;
                      const stat = historyRankStats.byRank[r] || { count: 0, incomeUsdt: 0 };
                      return (
                        <button
                          key={`hist-rank-dd-${r}`}
                          type="button"
                          onClick={() => {
                            setHistoryRankFilter(r);
                            setIsHistoryRankDropdownOpen(false);
                          }}
                          className={`w-full px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-left text-xs cursor-pointer ${
                            active
                              ? 'bg-gradient-to-r from-[#087cf4] to-[#0648b2] text-white font-bold'
                              : stat.count > 0
                              ? 'bg-[#f5fbff] hover:bg-[#e2f2ff] text-[#09265f]'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-400'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <strong className="font-mono font-black">Rank {r}</strong>
                            {stat.count > 0 && (
                              <span
                                className={`px-1.5 py-0.5 rounded-full text-[9.5px] font-extrabold ${
                                  active
                                    ? 'bg-white/20 text-white'
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}
                              >
                                {stat.count} รายการ
                              </span>
                            )}
                          </div>
                          <span
                            className={`font-mono text-[11px] font-bold ${
                              active
                                ? 'text-cyan-100'
                                : stat.incomeUsdt > 0
                                ? 'text-emerald-700'
                                : 'text-slate-400'
                            }`}
                          >
                            +{stat.incomeUsdt.toFixed(2)} U
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Search & Date/Time Filter Box */}
            <div className="p-3 rounded-2xl bg-white/85 border border-[#b8e5ff] space-y-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-[#54759c] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="ค้นหา Rank, #ID, Auto ID, Extra ID, โคลนนิ่ง, หมายเหตุ หรือ txHash..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#f5fbff] border border-[#bce4ff] text-xs font-semibold text-[#09265f] placeholder:text-[#6f8fb5] focus:outline-none focus:border-[#087cf4]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="block min-w-0">
                  <span className="text-[10px] font-bold text-[#3f6493] inline-flex items-center gap-1 mb-1">
                    <Calendar className="w-3 h-3" /> ตั้งแต่ (วัน-เวลา)
                  </span>
                  <input
                    type="datetime-local"
                    value={historyStartDateTime}
                    onChange={(e) => setHistoryStartDateTime(e.target.value)}
                    className="w-full min-w-0 max-w-full px-2.5 py-1.5 rounded-xl bg-[#f5fbff] border border-[#bce4ff] text-xs font-semibold text-[#09265f] focus:outline-none focus:border-[#087cf4]"
                  />
                </label>
                <label className="block min-w-0">
                  <span className="text-[10px] font-bold text-[#3f6493] inline-flex items-center gap-1 mb-1">
                    <Clock className="w-3 h-3" /> ถึง (วัน-เวลา)
                  </span>
                  <input
                    type="datetime-local"
                    value={historyEndDateTime}
                    onChange={(e) => setHistoryEndDateTime(e.target.value)}
                    className="w-full min-w-0 max-w-full px-2.5 py-1.5 rounded-xl bg-[#f5fbff] border border-[#bce4ff] text-xs font-semibold text-[#09265f] focus:outline-none focus:border-[#087cf4]"
                  />
                </label>
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const startOfToday = new Date(
                        now.getFullYear(),
                        now.getMonth(),
                        now.getDate(),
                        0,
                        0
                      );
                      setHistoryStartDateTime(toLocalDateTimeInput(startOfToday));
                      setHistoryEndDateTime(toLocalDateTimeInput(now));
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#e6f5ff] border border-[#b4e2ff] text-[11px] font-bold text-[#0756bc] hover:bg-[#d7eeff] cursor-pointer"
                  >
                    วันนี้
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                      setHistoryStartDateTime(toLocalDateTimeInput(sevenDaysAgo));
                      setHistoryEndDateTime(toLocalDateTimeInput(now));
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#e6f5ff] border border-[#b4e2ff] text-[11px] font-bold text-[#0756bc] hover:bg-[#d7eeff] cursor-pointer"
                  >
                    7 วันล่าสุด
                  </button>
                  {(historySearch ||
                    historyStartDateTime ||
                    historyEndDateTime ||
                    historyFilter !== 'all' ||
                    historyRankFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setHistorySearch('');
                        setHistoryStartDateTime('');
                        setHistoryEndDateTime('');
                        setHistoryFilter('all');
                        setHistoryRankFilter('all');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-600 hover:bg-rose-100 cursor-pointer"
                    >
                      ล้างตัวกรอง
                    </button>
                  )}
                </div>
                <span className="text-[11px] font-bold text-[#3f6493]">
                  แสดง {filteredHistoryRows.length} จาก {combinedHistoryRows.length} รายการ
                </span>
              </div>
            </div>

            {filteredHistoryRows.length === 0 ? (
              <div className="p-6 text-center rounded-2xl bg-white/70 border border-[#b8e5ff] text-xs font-semibold text-[#54759c]">
                ไม่พบรายการตามเงื่อนไขที่เลือกสำหรับ ID #{displayId}
              </div>
            ) : (
              <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
                {filteredHistoryRows.map((row) => {
                  const badgeStyle =
                    row.kind === 'direct'
                      ? 'bg-emerald-100 text-emerald-700'
                      : row.kind === 'level'
                      ? 'bg-cyan-100 text-cyan-700'
                      : row.kind === 'vault'
                      ? 'bg-indigo-100 text-indigo-700'
                      : row.kind === 'upgrade'
                      ? 'bg-amber-100 text-amber-800'
                      : row.kind === 'auto_id'
                      ? 'bg-violet-100 text-violet-700'
                      : row.kind === 'registration'
                      ? 'bg-teal-100 text-teal-800'
                      : 'bg-fuchsia-100 text-fuchsia-700';

                  return (
                    <div
                      key={row.id}
                      className="p-3 rounded-xl bg-white/95 border border-[#b8e5ff] flex items-start justify-between gap-2.5 text-xs"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${badgeStyle}`}>
                            {row.label}
                          </span>
                          {row.kind === 'upgrade' ? (
                            <span className="font-mono font-bold text-[#0754b9]">
                              R{row.fromRank} → R{row.toRank} · Node #{row.fromNodeId}
                            </span>
                          ) : row.kind === 'auto_id' ? (
                            <span className="font-mono font-bold text-violet-700">
                              Auto ID #{row.fromNodeId} · Rank {row.rank}
                            </span>
                          ) : row.kind === 'extra_id' ? (
                            <span className="font-mono font-bold text-fuchsia-700">
                              Extra R{row.rank}-#{row.fromNodeId}
                            </span>
                          ) : row.kind === 'registration' ? (
                            <span className="font-mono font-bold text-teal-700">
                              Node #{row.fromNodeId} · Rank {row.rank}
                            </span>
                          ) : (
                            <span className="font-mono font-bold text-[#0754b9]">
                              Rank {row.rank} · มาจาก {row.fromNodeType || `#${row.fromNodeId}`}
                            </span>
                          )}
                          {row.sourceStatusTh && (row.kind === 'direct' || row.kind === 'level' || row.kind === 'vault') && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                row.sourceStatusTh.includes('Clone')
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                  : row.sourceStatusTh.includes('Extra')
                                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                                  : row.sourceStatusTh.includes('Auto')
                                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                                  : 'bg-sky-50 border-sky-200 text-[#0754b9]'
                              }`}
                            >
                              สถานะ: {row.sourceStatusTh}
                            </span>
                          )}
                          {row.poolLabel ? (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-bold">
                              เข้า {row.poolLabel}
                            </span>
                          ) : (row.kind === 'direct' || row.kind === 'level') && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                              รับเข้ากระเป๋าแล้ว
                            </span>
                          )}
                          {row.isClone && (
                            <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 text-[10px] font-bold">
                              โคลนนิ่ง
                            </span>
                          )}
                          {row.isAdminFree && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">
                              Admin อัพฟรี
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#35567e] leading-snug break-words">
                          {row.note}
                        </p>
                        <div className="text-[10px] font-mono text-[#6283aa] flex items-center gap-1">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>{row.formattedDateTime}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0 font-mono space-y-0.5">
                        {row.kind === 'direct' || row.kind === 'level' || row.kind === 'vault' ? (
                          <strong className="text-sm font-black text-emerald-600 block">
                            +{row.amount.toFixed(2)} U
                          </strong>
                        ) : row.kind === 'upgrade' ? (
                          <>
                            <strong
                              className={`text-sm font-black block ${
                                row.isAdminFree
                                  ? 'text-slate-600'
                                  : row.isClone
                                  ? 'text-sky-700'
                                  : 'text-amber-700'
                              }`}
                            >
                              {row.isAdminFree
                                ? '0.00 U'
                                : row.isClone
                                ? `${row.amount.toFixed(2)} U`
                                : `-${row.amount.toFixed(2)} U`}
                            </strong>
                            {typeof row.vaultDeducted === 'number' && row.vaultDeducted > 0 && (
                              <span className="text-[10px] text-[#54759c] block">
                                หัก Vault {row.vaultDeducted.toFixed(2)} U
                              </span>
                            )}
                          </>
                        ) : row.kind === 'registration' ? (
                          <strong className="text-sm font-black text-teal-700 block">
                            {row.amount.toFixed(2)} U
                          </strong>
                        ) : (
                          <>
                            <strong
                              className={`text-sm font-black block ${
                                row.kind === 'auto_id' ? 'text-violet-700' : 'text-fuchsia-700'
                              }`}
                            >
                              -{row.amount.toFixed(2)} U
                            </strong>
                            <span className="text-[10px] text-[#54759c] block">
                              {row.kind === 'auto_id' ? 'Pool Auto ID' : 'Pool Extra ID'}
                            </span>
                          </>
                        )}
                        {row.txHash && (
                          <a
                            href={`https://bscscan.com/tx/${row.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-[#087cf4] hover:underline inline-flex items-center gap-0.5 justify-end"
                          >
                            BscScan <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}


      </div>

      {/* STICKY BOTTOM NAVIGATION BAR (MOBILE FULL DOCK / PC FLOATING PILL) */}
      <nav className="fixed bottom-0 lg:bottom-3 left-1/2 -translate-x-1/2 w-full lg:w-[min(920px,calc(100%-2rem))] grid grid-cols-5 px-1 sm:px-2.5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:py-2 bg-white/[0.97] dark:bg-[#061d56]/[0.97] border-t lg:border border-[#a9ddff] dark:border-[#3898ff]/50 rounded-t-[22px] lg:rounded-[24px] shadow-[0_-6px_22px_rgba(7,85,181,0.18)] lg:shadow-[0_12px_32px_rgba(2,28,88,0.35)] z-40">
        {(
          [
            { key: 'home', icon: '⌂', label: 'หน้าหลัก' },
            { key: 'id_vault', icon: '◈', label: 'คลังไอดี' },
            { key: 'matrix', icon: '⌘', label: 'Matrix' },
            { key: 'unilevel', icon: '❖', label: 'ยูนิ15ชั้น' },
            { key: 'history', icon: '▥', label: 'ประวัติรายได้' },
          ] as const
        ).map((tab) => {
          const isActive = bottomTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                if (tab.key === 'matrix') {
                  if (isViewingSubId) {
                    openDashboard2Matrix(selectedSubIdTarget!.rank, selectedSubIdTarget!.nodeId);
                  } else {
                    openDashboard2Matrix(1);
                  }
                } else if (tab.key === 'unilevel') {
                  openDashboard2Unilevel(effectiveMainId);
                } else {
                  setBottomTab(tab.key);
                }
              }}
              className={`text-center text-[9.5px] sm:text-[11px] font-bold py-1.5 px-0.5 rounded-[14px] sm:rounded-[16px] transition cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'text-white bg-gradient-to-br from-[#21bfff] to-[#0754d2] shadow-[0_4px_12px_rgba(5,119,223,0.47)]'
                  : 'text-[#42689c] dark:text-[#b6e4ff] hover:text-[#087cf4] dark:hover:text-white'
              }`}
            >
              <b className="block text-[17px] sm:text-[20px] leading-tight">{tab.icon}</b>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* INTERACTIVE MODALS FOR DASHBOARD 2 ACTIONS */}
      {activeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
          onClick={() => setActiveModal(null)}
        >
          <div
            className={`w-full ${
              activeModal === 'members' || activeModal === 'ranks_18'
                ? 'max-w-3xl'
                : activeModal === 'vault' || activeModal === 'income'
                ? 'max-w-2xl'
                : 'max-w-xl'
            } max-h-[88vh] overflow-y-auto overflow-x-hidden rounded-[22px] sm:rounded-[24px] bg-gradient-to-br from-white to-[#e3f4ff] border-2 border-[#a9ddff] shadow-2xl p-3 sm:p-5 text-[#09265f] space-y-3`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[#b8e5ff] pb-2.5 min-w-0">
              <h3 className="text-sm sm:text-lg font-black min-w-0 leading-snug">
                {activeModal === 'switch_id' && '⇄ สลับไอดี / เลือกรหัสที่ต้องการดู'}
                {activeModal === 'members' && `👥 สมาชิก & ลูกตรงทั้งหมดของ ID #${displayId} (แยกตาม Rank)`}
                {activeModal === 'ranks_18' && `👑 ตารางสมาชิกครบ 18 RANK (ID #${displayId})`}
                {activeModal === 'upgrade' && `📈 อัปเกรด Rank สำหรับ ID #${displayId}`}
                {activeModal === 'wallet' && `▰ กระเป๋าเงินและรายได้ ID #${displayId}`}
                {activeModal === 'vault' && `▣ รายละเอียดถังสะสมเงิน (Vault) ID #${displayId}`}
                {activeModal === 'allsell' && `🎁 สิทธิ์กองทุน AllSell Pool 4% (ID #${displayId})`}
                {activeModal === 'income' && `▰ รายได้ทั้งหมดของ ${matrixActiveIdSummary.label}`}
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-white hover:bg-blue-50 border border-[#b8e5ff] text-[#0756bc] cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* MODAL: SWITCH ID (STRICTLY FROM CONNECTED WALLET ONLY) */}
            {activeModal === 'switch_id' && (
              <div className="space-y-3 text-xs">
                {!account ? (
                  <div className="p-5 rounded-2xl bg-white border border-[#b8e5ff] text-center space-y-3">
                    <div className="text-sm font-black text-[#09265f]">
                      ยังไม่ได้เชื่อมต่อกระเป๋า Web3
                    </div>
                    <p className="text-[11px] text-[#55769b]">
                      กรุณาเชื่อมต่อกระเป๋า เพื่อดูรายการ ID ทั้งหมดที่มีอยู่ในกระเป๋าของคุณ
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveModal(null);
                        onConnectWallet();
                      }}
                      className="px-4 py-2 rounded-xl bg-gradient-to-br from-[#23caff] to-[#0755d7] text-white font-bold cursor-pointer shadow-sm"
                    >
                      เชื่อมต่อกระเป๋า
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="p-2.5 rounded-xl bg-white border border-[#b8e5ff] flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="text-[10px] font-bold text-[#55769b]">
                          อ้างอิงจากกระเป๋าที่เชื่อมต่อ
                        </div>
                        <div className="font-mono font-black text-[11px] sm:text-xs text-[#09265f] break-all">
                          {account}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-1 rounded-full bg-[#e0f2ff] border border-[#a9d7ff] text-[#0754b9] font-extrabold text-[11px] whitespace-nowrap">
                          พบในกระเป๋า{' '}
                          {ownedWalletReports.length +
                            ownedCloneIds.length +
                            ownedExtraIds.length}{' '}
                          IDs
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveModal(null);
                            setBottomTab('id_vault');
                          }}
                          className="px-2.5 py-1 rounded-xl bg-[#087cf4] hover:bg-[#0568d0] text-white font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer shadow-xs transition"
                        >
                          <span>◈ เปิดหน้าคลังไอดี ›</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveModal(null);
                            onOpenRegisterModal();
                          }}
                          className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer shadow-xs transition"
                        >
                          <UserPlus className="w-3 h-3" />
                          <span>{language === 'th' ? 'สมัคร/เพิ่ม ID' : 'Register / Add ID'}</span>
                        </button>
                      </div>
                    </div>

                    {ownedWalletReports.length === 0 &&
                    ownedCloneIds.length === 0 &&
                    ownedExtraIds.length === 0 ? (
                      <div className="p-5 rounded-2xl bg-white border border-[#b8e5ff] text-center space-y-3">
                        <div className="text-sm font-black text-[#09265f]">
                          ยังไม่พบ ID ในกระเป๋านี้
                        </div>
                        <p className="text-[11px] text-[#55769b]">
                          กระเป๋านี้ยังไม่ได้ลงทะเบียนในระบบ Fractal Flow Matrix 18
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveModal(null);
                            onOpenRegisterModal();
                          }}
                          className="px-4 py-2 rounded-xl bg-gradient-to-br from-[#23caff] to-[#0755d7] text-white font-bold cursor-pointer shadow-sm"
                        >
                          สมัครสมาชิกใหม่
                        </button>
                      </div>
                    ) : (
                      <>
                        {ownedWalletReports.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[260px] overflow-y-auto">
                            {ownedWalletReports.map((item) => {
                              const isSelected = !selectedSubIdTarget && item.id === displayId;
                              return (
                                <button
                                  key={item.key}
                                  type="button"
                                  onClick={() => {
                                    setSelectedSubIdTarget(null);
                                    setMatrixTargetRootNodeId(null);
                                    setMatrixTargetRank(undefined);
                                    setMatrixFocusVersion((v) => v + 1);
                                    onSelectMainId(String(item.mainIdToSelect));
                                    setActiveModal(null);
                                  }}
                                  className={`p-3 rounded-xl text-left border transition cursor-pointer flex items-center justify-between ${
                                    isSelected
                                      ? 'bg-gradient-to-br from-[#087cf4] to-[#0646b3] text-white border-[#5ddcff]'
                                      : 'bg-white hover:bg-blue-50 border-[#b8e5ff]'
                                  }`}
                                >
                                  <div>
                                    <div className="font-black text-sm">{item.label}</div>
                                    <div
                                      className={`text-[10px] font-mono ${
                                        isSelected ? 'text-cyan-100' : 'text-[#55769b]'
                                      }`}
                                    >
                                      Rank {item.rank} · แนะนำ #{item.directSponsorNodeId}
                                      {item.clonesCount > 0 ? ` · โคลน ${item.clonesCount}` : ''}
                                    </div>
                                  </div>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      isSelected
                                        ? 'bg-[#ffdf6d] text-[#173b77]'
                                        : item.isAuto
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-[#d7efff] text-[#0754b9]'
                                    }`}
                                  >
                                    {item.badge}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {ownedCloneIds.length > 0 && (
                          <div className="pt-2 border-t border-[#b8e5ff] space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-black text-emerald-800">
                                รหัสโคลนนิ่งในกระเป๋า ({ownedCloneIds.length} IDs):
                              </div>
                              <span className="text-[10px] font-semibold text-[#55769b]">
                                แตะเพื่อดูยอดรายได้และข้อมูลโคลน
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto">
                              {ownedCloneIds.map((c) => {
                                const sideTh =
                                  c.side === 'RIGHT'
                                    ? 'ขวา'
                                    : c.side === 'LEFT'
                                    ? 'ซ้าย'
                                    : '';
                                const isSelectedClone =
                                  selectedSubIdTarget?.kind === 'CLONE' &&
                                  selectedSubIdTarget.rank === c.rank &&
                                  selectedSubIdTarget.nodeId === c.id;
                                return (
                                  <div
                                    key={`clone-sw-${c.key}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                      setSelectedSubIdTarget({
                                        kind: 'CLONE',
                                        rank: c.rank,
                                        nodeId: c.id,
                                        mainId: c.mainId,
                                      });
                                      onSelectMainId(String(c.mainId));
                                      setMatrixTargetRank(c.rank);
                                      setMatrixTargetRootNodeId(c.id);
                                      setMatrixFocusVersion((v) => v + 1);
                                      setActiveModal(null);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setSelectedSubIdTarget({
                                          kind: 'CLONE',
                                          rank: c.rank,
                                          nodeId: c.id,
                                          mainId: c.mainId,
                                        });
                                        onSelectMainId(String(c.mainId));
                                        setMatrixTargetRank(c.rank);
                                        setMatrixTargetRootNodeId(c.id);
                                        setMatrixFocusVersion((v) => v + 1);
                                        setActiveModal(null);
                                      }
                                    }}
                                    className={`p-3 rounded-xl text-left border transition cursor-pointer flex items-center justify-between gap-2 shadow-2xs ${
                                      isSelectedClone
                                        ? 'bg-gradient-to-br from-[#059669] to-[#047857] text-white border-[#6ee7b7]'
                                        : 'bg-gradient-to-br from-[#f2fcf7] to-[#dcf7ea] hover:from-[#e6faef] hover:to-[#ccf2df] border-emerald-300'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <div
                                        className={`font-black text-sm truncate ${
                                          isSelectedClone ? 'text-white' : 'text-[#064e3b]'
                                        }`}
                                      >
                                        โคลน R{c.rank}-#{c.id}
                                      </div>
                                      <div
                                        className={`text-[10px] font-mono truncate ${
                                          isSelectedClone ? 'text-emerald-100' : 'text-[#047857]'
                                        }`}
                                      >
                                        จาก Main #{c.mainId} · ครั้งที่ {c.cloneSequence} (รอบ{' '}
                                        {c.cloneRound})
                                        {c.parentId > 0
                                          ? ` · ใต้ #${c.parentId}${sideTh ? ` (${sideTh})` : ''}`
                                          : ''}
                                      </div>
                                      <div
                                        className={`text-[10.5px] font-mono font-bold mt-0.5 ${
                                          isSelectedClone ? 'text-[#fde68a]' : 'text-[#0754b9]'
                                        }`}
                                      >
                                        รายได้รวม {c.totalIncomeUsdt.toFixed(2)} U · Vault{' '}
                                        {c.vault35GrossTotalUsdt.toFixed(2)} U
                                      </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1 shrink-0">
                                      <span
                                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                          isSelectedClone
                                            ? 'bg-[#ffdf6d] text-[#064e3b]'
                                            : 'bg-emerald-600 text-white'
                                        }`}
                                      >
                                        CLONE ID
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedSubIdTarget({
                                            kind: 'CLONE',
                                            rank: c.rank,
                                            nodeId: c.id,
                                            mainId: c.mainId,
                                          });
                                          onSelectMainId(String(c.mainId));
                                          openDashboard2Matrix(c.rank, c.id);
                                        }}
                                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition ${
                                          isSelectedClone
                                            ? 'bg-white/20 hover:bg-white/30 text-white'
                                            : 'bg-white/80 hover:bg-white border border-emerald-300 text-[#047857]'
                                        }`}
                                      >
                                        ดูผัง R{c.rank} ›
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {ownedExtraIds.length > 0 && (
                      <div className="pt-2 border-t border-[#b8e5ff] space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-black text-[#5b21b6]">
                            Extra IDs ในกระเป๋า ({ownedExtraIds.length} IDs):
                          </div>
                          <span className="text-[10px] font-semibold text-[#55769b]">
                            แตะเพื่อดูยอดรายได้และข้อมูล Extra ID
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[220px] overflow-y-auto">
                          {ownedExtraIds.map((ex) => {
                            const sideTh =
                              ex.side === 'RIGHT' ? 'ขวา' : ex.side === 'LEFT' ? 'ซ้าย' : '';
                            const isSelectedExtra =
                              selectedSubIdTarget?.kind === 'EXTRA' &&
                              selectedSubIdTarget.rank === ex.rank &&
                              selectedSubIdTarget.nodeId === ex.id;
                            return (
                              <div
                                key={`ex-sw-${ex.key}`}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  setSelectedSubIdTarget({
                                    kind: 'EXTRA',
                                    rank: ex.rank,
                                    nodeId: ex.id,
                                    mainId: ex.mainId,
                                  });
                                  onSelectMainId(String(ex.mainId));
                                  setMatrixTargetRank(ex.rank);
                                  setMatrixTargetRootNodeId(ex.id);
                                  setMatrixFocusVersion((v) => v + 1);
                                  setActiveModal(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setSelectedSubIdTarget({
                                      kind: 'EXTRA',
                                      rank: ex.rank,
                                      nodeId: ex.id,
                                      mainId: ex.mainId,
                                    });
                                    onSelectMainId(String(ex.mainId));
                                    setMatrixTargetRank(ex.rank);
                                    setMatrixTargetRootNodeId(ex.id);
                                    setMatrixFocusVersion((v) => v + 1);
                                    setActiveModal(null);
                                  }
                                }}
                                className={`p-3 rounded-xl text-left border transition cursor-pointer flex items-center justify-between gap-2 shadow-2xs ${
                                  isSelectedExtra
                                    ? 'bg-gradient-to-br from-[#7c3aed] to-[#5b21b6] text-white border-[#ddd6fe]'
                                    : 'bg-gradient-to-br from-[#faf5ff] to-[#ede9fe] hover:from-[#f3e8ff] hover:to-[#e4dbff] border-violet-300'
                                }`}
                              >
                                <div className="min-w-0">
                                  <div
                                    className={`font-black text-sm truncate ${
                                      isSelectedExtra ? 'text-white' : 'text-[#4c1d95]'
                                    }`}
                                  >
                                    Extra R{ex.rank}-#{ex.id}
                                  </div>
                                  <div
                                    className={`text-[10px] font-mono truncate ${
                                      isSelectedExtra ? 'text-violet-100' : 'text-[#6d28d9]'
                                    }`}
                                  >
                                    จาก Main #{ex.mainId}
                                    {ex.parentId > 0
                                      ? ` · ใต้ #${ex.parentId}${sideTh ? ` (${sideTh})` : ''}`
                                      : ''}
                                  </div>
                                  <div
                                    className={`text-[10.5px] font-mono font-bold mt-0.5 ${
                                      isSelectedExtra ? 'text-[#fde68a]' : 'text-[#0754b9]'
                                    }`}
                                  >
                                    รายได้รวม {ex.totalIncomeUsdt.toFixed(2)} U · Vault{' '}
                                    {ex.vault35GrossTotalUsdt.toFixed(2)} U
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                      isSelectedExtra
                                        ? 'bg-[#ffdf6d] text-[#4c1d95]'
                                        : 'bg-violet-600 text-white'
                                    }`}
                                  >
                                    EXTRA ID
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedSubIdTarget({
                                        kind: 'EXTRA',
                                        rank: ex.rank,
                                        nodeId: ex.id,
                                        mainId: ex.mainId,
                                      });
                                      onSelectMainId(String(ex.mainId));
                                      openDashboard2Matrix(ex.rank, ex.id);
                                    }}
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition ${
                                      isSelectedExtra
                                        ? 'bg-white/20 hover:bg-white/30 text-white'
                                        : 'bg-white/80 hover:bg-white border border-violet-300 text-[#5b21b6]'
                                    }`}
                                  >
                                    ดูผัง R{ex.rank} ›
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* MODAL: MEMBERS & DIRECT SPONSOR BY RANK */}
            {activeModal === 'members' && (() => {
              const isFreshMembers = Boolean(activeMembersData);
              const rankList: any[] = isFreshMembers && Array.isArray(activeMembersData.ranks)
                ? activeMembersData.ranks
                : [];
              const summary = (isFreshMembers && activeMembersData.summary) || {
                totalAllMembersAcrossRanks: 0,
                totalUniqueMemberMainIds: 0,
                totalDirectMainIds: directMainIdsList.length,
                totalDirectNodesAcrossRanks: 0,
                totalSubtreeNodesAcrossRanks: 0,
                totalAutoIds,
                totalExtraIds,
                totalClones,
                unlockedRanksCount: currentRank,
                ranksWithMembersCount: 0,
              };
              const searchTrim = membersSearch.trim().toLowerCase().replace(/^#/, '');

              const filteredRanks = rankList
                .map((rGroup) => {
                  const baseMembers: any[] = Array.isArray(rGroup.members) ? rGroup.members : [];
                  const scopedMembers = baseMembers.filter((m) => {
                    if (membersScope === 'direct' && !m.isDirect) return false;
                    if (membersScope === 'subtree' && !m.isInSubtree) return false;
                    if (searchTrim) {
                      const hay = `${m.nodeId} ${m.originMainId} ${m.label} ${m.owner} r${m.rank}`.toLowerCase();
                      if (!hay.includes(searchTrim)) return false;
                    }
                    return true;
                  });
                  return {
                    ...rGroup,
                    filteredMembers: scopedMembers,
                  };
                })
                .filter((rGroup) => {
                  if (membersSelectedRank !== 'all') {
                    return rGroup.rank === membersSelectedRank;
                  }
                  return rGroup.filteredMembers.length > 0 || rGroup.selfNodeId !== null;
                });

              return (
                <div className="space-y-3 text-xs">
                  {/* Top Summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="p-2.5 rounded-xl bg-white border border-[#b8e5ff]">
                      <div className="text-[10px] text-[#55769b]">สมาชิกของ ID #{displayId}</div>
                      <strong className="text-lg font-black text-[#0754b9] block">
                        {isFreshMembers ? summary.totalAllMembersAcrossRanks : '...'}
                      </strong>
                      <span className="text-[10px] text-[#55769b]">
                        ({summary.totalUniqueMemberMainIds} Main IDs)
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-[#b8e5ff]">
                      <div className="text-[10px] text-[#55769b]">ลูกตรง (Direct)</div>
                      <strong className="text-lg font-black text-emerald-700 block">
                        {summary.totalDirectMainIds} IDs
                      </strong>
                      <span className="text-[10px] text-emerald-700">
                        ({summary.totalDirectNodesAcrossRanks} โหนดในทุก Rank)
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-[#b8e5ff]">
                      <div className="text-[10px] text-[#55769b]">สายงานใต้ผัง (Downline)</div>
                      <strong className="text-lg font-black text-[#087cf4] block">
                        {summary.totalSubtreeNodesAcrossRanks}
                      </strong>
                      <span className="text-[10px] text-[#55769b]">
                        Auto ในผัง {summary.totalAutoIds} (สร้างเอง {totalAutoIds}) · Extra {summary.totalExtraIds} · โคลน {summary.totalClones}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-[#b8e5ff]">
                      <div className="text-[10px] text-[#55769b]">Rank ที่พบสมาชิก</div>
                      <strong className="text-lg font-black text-purple-700 block">
                        {summary.ranksWithMembersCount} / 18
                      </strong>
                      <span className="text-[10px] text-purple-700">
                        ปลดล็อกแล้ว {summary.unlockedRanksCount} Rank
                      </span>
                    </div>
                  </div>

                  {/* Scope Tabs + Search + Switch ID + Refresh */}
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-white/80 p-2 rounded-2xl border border-[#b8e5ff]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(
                        [
                          { key: 'all', label: 'ทั้งหมด (สายงาน+ลูกตรง)' },
                          { key: 'direct', label: 'เฉพาะลูกตรง (Direct)' },
                          { key: 'subtree', label: 'เฉพาะใต้ผัง (Subtree)' },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setMembersScope(tab.key)}
                          className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                            membersScope === tab.key
                              ? 'bg-gradient-to-br from-[#23caff] to-[#0755d7] text-white shadow-xs'
                              : 'bg-[#f3faff] text-[#0756bc] border border-[#b8e5ff] hover:bg-blue-50'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-1.5 w-full sm:w-auto sm:min-w-[200px] min-w-0">
                      <input
                        type="text"
                        value={membersSearch}
                        onChange={(e) => setMembersSearch(e.target.value)}
                        placeholder="ค้นหา #ID หรือ 0x..."
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl border border-[#a9d7ff] bg-white text-[11px] font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setActiveModal('switch_id')}
                        className="px-2.5 py-1.5 rounded-xl bg-[#e6f5ff] border border-[#96ceff] text-[#0754b9] font-bold cursor-pointer hover:bg-[#d5eeff] whitespace-nowrap shrink-0"
                      >
                        ⇄ สลับ ID
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          fetchIdMembers(
                            effectiveMainId,
                            isViewingSubId
                              ? {
                                  kind: selectedSubIdTarget!.kind,
                                  rank: selectedSubIdTarget!.rank,
                                  nodeId: selectedSubIdTarget!.nodeId,
                                }
                              : null
                          )
                        }
                        className="px-2.5 py-1.5 rounded-xl bg-white border border-[#a9d7ff] text-[#0756bc] font-bold cursor-pointer hover:bg-blue-50 inline-flex items-center gap-1 shrink-0"
                        title="รีเฟรชข้อมูลสมาชิก"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${membersLoading ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {/* Rank Selector Pills (Rank 1 - 18) */}
                  <div className="flex items-center gap-1.5 w-full max-w-full min-w-0 matrix-horizontal-scroll-only pb-1">
                    <button
                      type="button"
                      onClick={() => setMembersSelectedRank('all')}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                        membersSelectedRank === 'all'
                          ? 'bg-[#0754b9] text-white'
                          : 'bg-white border border-[#b8e5ff] text-[#0756bc] hover:bg-blue-50'
                      }`}
                    >
                      ทุก Rank ({summary.totalAllMembersAcrossRanks})
                    </button>
                    {rankList.map((rGroup) => {
                      const cnt =
                        membersScope === 'direct'
                          ? rGroup.directCountInRank
                          : membersScope === 'subtree'
                          ? rGroup.subtreeCountInRank
                          : rGroup.totalMembersInRank;
                      const isSel = membersSelectedRank === rGroup.rank;
                      return (
                        <button
                          key={`rk-pill-${rGroup.rank}`}
                          type="button"
                          onClick={() => setMembersSelectedRank(rGroup.rank)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap transition cursor-pointer ${
                            isSel
                              ? 'bg-[#087cf4] text-white'
                              : cnt > 0
                              ? 'bg-white border border-[#6ec8ff] text-[#0754b9] hover:bg-blue-50'
                              : 'bg-white/60 border border-[#d6ecff] text-[#8ba5c4] hover:bg-white'
                          }`}
                        >
                          R{rGroup.rank} ({cnt})
                        </button>
                      );
                    })}
                  </div>

                  {/* Content Body */}
                  {!isFreshMembers && membersLoading ? (
                    <div className="p-8 text-center rounded-2xl bg-white/80 border border-[#b8e5ff] text-[#0756bc] font-bold">
                      กำลังดึงข้อมูลสมาชิกทั้งหมดของ ID #{displayId} แยกตาม Rank 1–18...
                    </div>
                  ) : membersError ? (
                    <div className="p-4 text-center rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 font-bold">
                      {membersError}
                    </div>
                  ) : filteredRanks.length === 0 ? (
                    <div className="p-6 text-center rounded-2xl bg-white/80 border border-[#b8e5ff] text-[#55769b]">
                      ไม่พบข้อมูลสมาชิกในตัวกรองที่เลือกสำหรับ ID #{displayId}
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[46vh] overflow-y-auto pr-1">
                      {filteredRanks.map((rGroup) => {
                        const list: any[] = rGroup.filteredMembers || [];
                        return (
                          <div
                            key={`rank-sec-${rGroup.rank}`}
                            className="rounded-2xl bg-white/90 border border-[#a9d7ff] overflow-hidden shadow-2xs"
                          >
                            {/* Rank Section Header */}
                            <div className="px-3 py-2 bg-gradient-to-r from-[#e8f5ff] to-[#d5eeff] border-b border-[#b8e5ff] flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="px-2.5 py-0.5 rounded-lg bg-[#0754b9] text-white font-black text-xs">
                                  RANK {rGroup.rank}
                                </span>
                                <span className="text-[11px] font-bold text-[#0754b9]">
                                  ({Number(rGroup.rankPriceUsdt || 5).toLocaleString()} U)
                                </span>
                                {rGroup.selfNodeId ? (
                                  <span className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                                    โหนดของคุณ: R{rGroup.rank}-#{rGroup.selfNodeId}
                                  </span>
                                ) : (
                                  <span className="text-[10.5px] text-[#6d89ab] bg-white/70 border border-[#d0e6f8] px-2 py-0.5 rounded-md">
                                    ยังไม่ปลดล็อก Rank นี้
                                  </span>
                                )}
                                {Array.isArray(rGroup.selfCloneIds) && rGroup.selfCloneIds.length > 0 && (
                                  <span className="inline-flex items-center gap-1 flex-wrap text-[10.5px] font-mono text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                                    <span>โคลนของคุณ:</span>
                                    {rGroup.selfCloneIds.map((c: number) => (
                                      <button
                                        key={`self-clone-r${rGroup.rank}-${c}`}
                                        type="button"
                                        onClick={() => openDashboard2Matrix(rGroup.rank, Number(c))}
                                        className="underline font-bold hover:text-indigo-900 cursor-pointer"
                                      >
                                        #{c}
                                      </button>
                                    ))}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-[#09265f]">
                                  ตรง {rGroup.directCountInRank} · ใต้ผัง {rGroup.subtreeCountInRank} · แสดง {list.length}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    openDashboard2Matrix(rGroup.rank);
                                  }}
                                  className="px-2 py-0.5 rounded-lg bg-white border border-[#96ceff] text-[10.5px] font-bold text-[#0756bc] hover:bg-blue-50 cursor-pointer inline-flex items-center gap-0.5"
                                >
                                  <span>เปิดผัง R{rGroup.rank}</span>
                                  <ArrowUpRight className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            {/* Members Grid for this Rank */}
                            {list.length === 0 ? (
                              <div className="p-3 text-center text-[11px] text-[#6d89ab]">
                                {rGroup.totalMembersInRank === 0
                                  ? `ยังไม่มีสมาชิกหรือลูกตรงใน Rank ${rGroup.rank}`
                                  : `ไม่มีสมาชิกใน Rank ${rGroup.rank} ที่ตรงกับตัวกรอง`}
                              </div>
                            ) : (
                              <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {list.map((m: any) => {
                                  const typeBadgeClass =
                                    m.memberType === 'AUTO_ID'
                                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                                      : m.memberType === 'EXTRA_ID'
                                      ? 'bg-rose-100 text-rose-700 border-rose-300'
                                      : m.memberType === 'CLONE_ID'
                                      ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                                      : 'bg-blue-100 text-[#0754b9] border-blue-200';
                                  const canInspectMain = m.originMainId > 0 && m.memberType !== 'EXTRA_ID';
                                  return (
                                    <div
                                      key={`m-r${rGroup.rank}-n${m.nodeId}`}
                                      onClick={() => {
                                        if (canInspectMain) {
                                          onSelectMainId(String(m.originMainId));
                                        }
                                      }}
                                      className={`p-2.5 rounded-xl bg-white border border-[#c7e7ff] flex flex-col justify-between gap-1.5 transition ${
                                        canInspectMain
                                          ? 'hover:border-[#087cf4] hover:shadow-xs cursor-pointer'
                                          : ''
                                      }`}
                                    >
                                      <div className="flex items-start justify-between gap-1.5">
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <strong className="text-[13px] font-black text-[#09265f]">
                                              {m.label}
                                            </strong>
                                            <span
                                              className={`px-1.5 py-0.5 rounded-md border text-[9.5px] font-extrabold ${typeBadgeClass}`}
                                            >
                                              {m.memberType === 'AUTO_ID'
                                                ? 'AUTO'
                                                : m.memberType === 'EXTRA_ID'
                                                ? 'EXTRA'
                                                : m.memberType === 'CLONE_ID'
                                                ? 'CLONE'
                                                : 'MAIN'}
                                            </span>
                                          </div>
                                          <div className="text-[10.5px] font-mono text-[#45668f] mt-0.5">
                                            โหนด R{m.rank}-#{m.nodeId} · ใต้ #{m.parentId} (
                                            {m.side === 'LEFT' ? 'ซ้าย ↙' : m.side === 'RIGHT' ? 'ขวา ↘' : 'Root'})
                                          </div>
                                        </div>

                                        <span className="px-1.5 py-0.5 rounded-md bg-[#eef7ff] border border-[#bfe2ff] text-[10px] font-black text-[#0754b9] shrink-0">
                                          Max R{m.currentMaxRank}
                                        </span>
                                      </div>

                                      <div className="flex items-center justify-between gap-1.5 flex-wrap pt-1 border-t border-[#ebf5ff] text-[10px]">
                                        <div className="flex items-center gap-1 flex-wrap">
                                          {m.isDirect && (
                                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                                              ลูกตรง ✓
                                            </span>
                                          )}
                                          {m.tier !== null && (
                                            <span className="px-1.5 py-0.5 rounded bg-cyan-50 border border-cyan-200 text-cyan-800 font-bold">
                                              {m.viaCloneNodeId
                                                ? `ใต้โคลน #${m.viaCloneNodeId} · ชั้น ${m.tier}`
                                                : `ชั้นที่ ${m.tier}`}
                                            </span>
                                          )}
                                          <span className="text-[#55769b] font-mono">
                                            ผู้แนะนำ #{m.directSponsorNodeId}
                                          </span>
                                        </div>
                                        <span className="font-mono text-[#6a85a8]">
                                          {String(m.owner || '').slice(0, 6)}...{String(m.owner || '').slice(-4)}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* MODAL: UPGRADE RANK */}
            {activeModal === 'upgrade' && (
              <div className="space-y-3 text-xs">
                {currentRank >= 18 ? (
                  <div className="p-5 text-center rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
                    <ShieldCheck className="w-8 h-8 mx-auto mb-1 text-emerald-600" />
                    ID #{displayId} ปลดล็อกถึงระดับสูงสุด Rank 18 แล้ว!
                  </div>
                ) : (
                  <>
                    <div className="p-3.5 rounded-2xl bg-white border border-[#b8e5ff] space-y-2">
                      <div className="flex items-center justify-between">
                        <span>ระดับถัดไป:</span>
                        <strong className="text-base font-black text-[#0754b9]">
                          Rank {nextRank} ({nextRankPrice.toLocaleString()} USDT)
                        </strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>หักจาก Upgrade Rank Pool:</span>
                        <strong className="text-emerald-700 font-mono">
                          -{Math.min(nextRankPrice, vaultPools.upgradeRankPool).toFixed(2)} USDT
                        </strong>
                      </div>
                      <div className="flex items-center justify-between border-t border-[#b8e5ff] pt-2">
                        <span>ยอดส่วนต่างที่ต้องชำระจาก Wallet:</span>
                        <strong className="text-base font-black text-amber-700 font-mono">
                          {walletNeededForNextRank.toFixed(2)} USDT
                        </strong>
                      </div>
                    </div>

                    {!account ? (
                      <button
                        type="button"
                        onClick={onConnectWallet}
                        className="w-full py-2.5 rounded-xl bg-gradient-to-br from-[#23caff] to-[#0755d7] text-white font-bold cursor-pointer"
                      >
                        เชื่อมต่อกระเป๋าเพื่ออัปเกรด
                      </button>
                    ) : !isOwnedByConnectedWallet ? (
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                        กระเป๋าที่เชื่อมต่อปัจจุบันไม่ใช่เจ้าของ ID #{displayId} กรุณาสลับไอดีหรือสลับกระเป๋า
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        {needsUsdtApproval && walletNeededForNextRank > 0 && (
                          <button
                            type="button"
                            disabled={isLoadingTx}
                            onClick={() => onApproveUsdt(walletNeededForNextRank)}
                            className="flex-1 py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black cursor-pointer disabled:opacity-50"
                          >
                            1. อนุมัติ USDT ({walletNeededForNextRank.toFixed(2)} U)
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isLoadingTx}
                          onClick={async () => {
                            const upgRes = await onUpgradeToRank(nextRank, displayId);
                            if (upgRes && upgRes.success !== false) {
                              setActiveModal(null);
                              setSelectedSubIdTarget(null);
                              openDashboard2Matrix(nextRank, null);
                            }
                          }}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-br from-[#23caff] to-[#0755d7] text-white font-black cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1"
                        >
                          <Sparkles className="w-4 h-4 shrink-0" />
                          <span>อัปเกรดสู่ Rank {nextRank}</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* MODAL: WALLET */}
            {activeModal === 'wallet' && (
              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-xl bg-white border border-[#b8e5ff]">
                    <div className="text-[10px] text-[#55769b]">30% ค่าแนะนำตรง</div>
                    <strong className="text-lg font-black text-emerald-700">
                      +{direct30Total.toFixed(2)} USDT
                    </strong>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-[#b8e5ff]">
                    <div className="text-[10px] text-[#55769b]">30% ค่าบริหารชั้น (15 ชั้น)</div>
                    <strong className="text-lg font-black text-cyan-700">
                      +{level30Total.toFixed(2)} USDT
                    </strong>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-[#b8e5ff]">
                    <div className="text-[10px] text-[#55769b]">USDT ในกระเป๋า</div>
                    <strong className="text-base font-black text-[#0754b9]">
                      {Number(usdtBalance || 0).toFixed(2)} U
                    </strong>
                  </div>
                  <div className="p-3 rounded-xl bg-white border border-[#b8e5ff]">
                    <div className="text-[10px] text-[#55769b]">BNB ค่า Gas</div>
                    <strong className="text-base font-black text-[#0754b9]">
                      {Number(bnbBalance || 0).toFixed(4)} BNB
                    </strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    setBottomTab('history');
                  }}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-br from-[#23caff] to-[#0755d7] text-white font-bold cursor-pointer"
                >
                  ดูประวัติรายได้ทั้งหมดของ ID #{displayId}
                </button>
              </div>
            )}

            {/* MODAL: TOTAL INCOME BREAKDOWN & LEDGER */}
            {activeModal === 'income' && (() => {
              const allIncomeRows = combinedHistoryRows.filter(
                (r) => r.kind === 'direct' || r.kind === 'level'
              );
              const directCount = allIncomeRows.filter((r) => r.kind === 'direct').length;
              const levelCount = allIncomeRows.filter((r) => r.kind === 'level').length;
              const rankIncomeList = Array.from({ length: 18 }, (_, i) => i + 1)
                .map((r) => {
                  const info = matrixActiveIdSummary.incomeByRank?.[r] || {
                    directUsdt: 0,
                    levelUsdt: 0,
                    totalUsdt: 0,
                  };
                  const count = allIncomeRows.filter((row) => Number(row.rank || 1) === r).length;
                  return { rank: r, ...info, count };
                })
                .filter(
                  (item) =>
                    item.totalUsdt > 0 ||
                    item.count > 0 ||
                    (!isViewingSubId && item.rank <= currentRank) ||
                    (isViewingSubId && item.rank === Number(selectedSubIdTarget?.rank || currentRank))
                );

              const filteredIncomeRows = allIncomeRows.filter((row) => {
                if (incomeModalFilter !== 'all' && row.kind !== incomeModalFilter) return false;
                if (incomeModalRankFilter !== 'all' && Number(row.rank || 1) !== incomeModalRankFilter) {
                  return false;
                }
                return true;
              });

              return (
                <div className="space-y-3 text-xs">
                  {/* Top 3 Summary Boxes */}
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center">
                    <div className="p-2 sm:p-2.5 rounded-xl bg-white border border-[#b8e5ff] min-w-0">
                      <div className="text-[10px] text-[#55769b] leading-tight">รายได้รวมทั้งหมด</div>
                      <strong className="text-xs sm:text-base font-black text-emerald-700 font-mono tabular-nums block truncate">
                        +{totalIncomeUsdt.toFixed(2)} U
                      </strong>
                      <div className="text-[10px] text-[#4f7097] font-semibold">
                        {allIncomeRows.length} รายการ
                      </div>
                    </div>
                    <div className="p-2 sm:p-2.5 rounded-xl bg-white border border-[#b8e5ff] min-w-0">
                      <div className="text-[10px] text-[#55769b] leading-tight">30% ค่าแนะนำตรง</div>
                      <strong className="text-xs sm:text-base font-black text-[#0754b9] font-mono tabular-nums block truncate">
                        +{direct30Total.toFixed(2)} U
                      </strong>
                      <div className="text-[10px] text-[#4f7097] font-semibold">
                        {directCount} รายการ
                      </div>
                    </div>
                    <div className="p-2 sm:p-2.5 rounded-xl bg-white border border-[#b8e5ff] min-w-0">
                      <div className="text-[10px] text-[#55769b] leading-tight">30% ค่าบริหารชั้น</div>
                      <strong className="text-xs sm:text-base font-black text-cyan-700 font-mono tabular-nums block truncate">
                        +{level30Total.toFixed(2)} U
                      </strong>
                      <div className="text-[10px] text-[#4f7097] font-semibold">
                        {levelCount} รายการ
                      </div>
                    </div>
                  </div>

                  {/* Per-Rank Income Breakdown */}
                  {rankIncomeList.length > 0 && (
                    <div className="p-2.5 rounded-2xl bg-white/90 border border-[#b8e5ff] space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-black text-[#09265f]">
                          📊 รายได้แยกตาม Rank (แตะเพื่อกรอง)
                        </span>
                        {incomeModalRankFilter !== 'all' && (
                          <button
                            type="button"
                            onClick={() => setIncomeModalRankFilter('all')}
                            className="text-[10px] font-bold text-[#0754b9] hover:underline cursor-pointer"
                          >
                            แสดงทุก Rank
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {rankIncomeList.map((item) => {
                          const active = incomeModalRankFilter === item.rank;
                          return (
                            <button
                              key={`inc-modal-r-${item.rank}`}
                              type="button"
                              onClick={() =>
                                setIncomeModalRankFilter(active ? 'all' : item.rank)
                              }
                              className={`p-2 rounded-xl border text-left cursor-pointer transition ${
                                active
                                  ? 'bg-[#087cf4] text-white border-[#0754b9] shadow-sm'
                                  : 'bg-[#f5fbff] text-[#09265f] border-[#cde7ff] hover:bg-[#e5f3ff]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                    active
                                      ? 'bg-white/20 text-white'
                                      : 'bg-[#dff0ff] text-[#0754b9]'
                                  }`}
                                >
                                  R{item.rank}
                                </span>
                                <span
                                  className={`text-[10px] font-mono ${
                                    active ? 'text-cyan-100' : 'text-[#5a78a1]'
                                  }`}
                                >
                                  {item.count} รายการ
                                </span>
                              </div>
                              <div
                                className={`mt-1 text-sm font-black font-mono ${
                                  active ? 'text-white' : 'text-emerald-700'
                                }`}
                              >
                                +{item.totalUsdt.toFixed(2)} U
                              </div>
                              <div
                                className={`text-[9.5px] font-semibold truncate ${
                                  active ? 'text-blue-100' : 'text-[#4f7097]'
                                }`}
                              >
                                แนะนำ {item.directUsdt.toFixed(1)} · ชั้น {item.levelUsdt.toFixed(1)}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Type Filter Chips */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(
                        [
                          { key: 'all', label: `ทั้งหมด (${allIncomeRows.length})` },
                          { key: 'direct', label: `30% แนะนำ (${directCount})` },
                          { key: 'level', label: `30% ค่าชั้น (${levelCount})` },
                        ] as const
                      ).map((chip) => {
                        const active = incomeModalFilter === chip.key;
                        return (
                          <button
                            key={`inc-chip-${chip.key}`}
                            type="button"
                            onClick={() => setIncomeModalFilter(chip.key)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer transition ${
                              active
                                ? 'bg-[#087cf4] text-white shadow-xs'
                                : 'bg-white text-[#0756bc] border border-[#b4e0ff] hover:bg-[#eef8ff]'
                            }`}
                          >
                            {chip.label}
                          </button>
                        );
                      })}
                    </div>
                    <span className="text-[10.5px] font-bold text-[#4f7097]">
                      แสดง {filteredIncomeRows.length} รายการ
                    </span>
                  </div>

                  {/* Income Rows */}
                  {filteredIncomeRows.length === 0 ? (
                    <div className="p-5 text-center rounded-2xl bg-white border border-[#b8e5ff] text-[#55769b] font-semibold">
                      ยังไม่มีรายการรายได้ตามเงื่อนไขที่เลือก
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                      {filteredIncomeRows.map((row) => (
                        <div
                          key={`inc-modal-row-${row.id}`}
                          className="p-2.5 rounded-xl bg-white border border-[#b8e5ff] flex items-start justify-between gap-2"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                                  row.kind === 'direct'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-cyan-100 text-cyan-700'
                                }`}
                              >
                                {row.label}
                              </span>
                              <span className="font-mono font-bold text-[#0754b9]">
                                Rank {row.rank} · มาจาก {row.fromNodeType || `#${row.fromNodeId}`}
                              </span>
                              {row.sourceStatusTh && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                    row.sourceStatusTh.includes('Clone')
                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                      : row.sourceStatusTh.includes('Extra')
                                      ? 'bg-rose-50 border-rose-200 text-rose-700'
                                      : row.sourceStatusTh.includes('Auto')
                                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                                      : 'bg-sky-50 border-sky-200 text-[#0754b9]'
                                  }`}
                                >
                                  สถานะ: {row.sourceStatusTh}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[#35567e] leading-snug break-words">
                              {row.note}
                            </p>
                            <div className="text-[10px] font-mono text-[#6283aa] flex items-center gap-1">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span>{row.formattedDateTime}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0 font-mono space-y-0.5">
                            <strong className="text-sm font-black text-emerald-600 block">
                              +{row.amount.toFixed(2)} U
                            </strong>
                            {isRealChainTxHash(row.txHash) && (
                              <a
                                href={`https://bscscan.com/tx/${row.txHash}`}
                                target="_blank"
                                rel="noreferrer"
                                className="px-2 py-0.5 rounded-lg bg-[#eff8ff] border border-[#a9d7ff] text-[10px] font-bold text-[#0756bc] hover:underline inline-flex items-center gap-0.5"
                              >
                                BscScan <ArrowUpRight className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setActiveModal(null);
                      setBottomTab('history');
                    }}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-br from-[#23caff] to-[#0755d7] text-white font-bold cursor-pointer hover:brightness-105"
                  >
                    เปิดหน้าประวัติรายได้ฉบับเต็ม →
                  </button>
                </div>
              );
            })()}

            {/* MODAL: VAULT LEDGER & POOL DETAILS */}
            {activeModal === 'vault' && (
              <div className="space-y-3 text-xs">
                {/* 3 Overall Vault Summary Boxes */}
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center">
                  <div className="p-2 sm:p-2.5 rounded-xl bg-white border border-[#b8e5ff] min-w-0">
                    <div className="text-[10px] text-[#55769b] leading-tight">สะสม Vault รวม</div>
                    <strong className="text-xs sm:text-base font-black text-[#0754b9] font-mono tabular-nums block truncate">
                      {vaultPools.grossTotal.toFixed(2)} U
                    </strong>
                  </div>
                  <div className="p-2 sm:p-2.5 rounded-xl bg-white border border-[#b8e5ff] min-w-0">
                    <div className="text-[10px] text-[#55769b] leading-tight">ถูกใช้ไปแล้ว</div>
                    <strong className="text-xs sm:text-base font-black text-rose-600 font-mono tabular-nums block truncate">
                      -{vaultPools.deductedTotal.toFixed(2)} U
                    </strong>
                  </div>
                  <div className="p-2 sm:p-2.5 rounded-xl bg-white border border-[#b8e5ff] min-w-0">
                    <div className="text-[10px] text-[#55769b] leading-tight">คงเหลือ 3 ถัง</div>
                    <strong className="text-xs sm:text-base font-black text-emerald-700 font-mono tabular-nums block truncate">
                      {vaultPools.totalRemaining.toFixed(2)} U
                    </strong>
                  </div>
                </div>

                {/* Interactive Pool Selector Tabs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {(
                    [
                      {
                        key: 'all',
                        title: 'ทั้งหมด (3 ถัง)',
                        sub: `คงเหลือ ${vaultPools.totalRemaining.toFixed(2)} U`,
                        activeCls: 'bg-[#087cf4] text-white border-[#087cf4]',
                      },
                      {
                        key: 'upgrade',
                        title: '🚀 อัพเกรด Rank',
                        sub: `${vaultPools.upgradeRankPool.toFixed(2)} U`,
                        activeCls: 'bg-[#0284c7] text-white border-[#0284c7]',
                      },
                      {
                        key: 'auto_id',
                        title: `👤 Auto ID (${totalAutoIds})`,
                        sub: `${vaultPools.newAutoIdPool.toFixed(2)} U · ใช้ ${vaultPools.autoIdsDeductedUsdt.toFixed(0)} U`,
                        activeCls: 'bg-emerald-600 text-white border-emerald-600',
                      },
                      {
                        key: 'extra_id',
                        title: `✦ Extra ID (${totalExtraIds})`,
                        sub: `${vaultPools.newExtraIdPool.toFixed(2)} U · ใช้ ${vaultPools.extraIdsDeductedUsdt.toFixed(0)} U`,
                        activeCls: 'bg-violet-600 text-white border-violet-600',
                      },
                    ] as const
                  ).map((t) => {
                    const isActive = vaultPoolTab === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setVaultPoolTab(t.key)}
                        className={`p-2 rounded-xl border text-left transition cursor-pointer ${
                          isActive
                            ? `${t.activeCls} shadow-sm`
                            : 'bg-white border-[#b8e5ff] text-[#09265f] hover:bg-[#eff8ff]'
                        }`}
                      >
                        <div className="font-black text-[11px] leading-tight">{t.title}</div>
                        <div
                          className={`text-[10px] font-mono mt-0.5 ${
                            isActive ? 'text-white/90' : 'text-[#4c6f97]'
                          }`}
                        >
                          {t.sub}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Focused Pool Summary & Spawned IDs List */}
                {vaultPoolTab === 'upgrade' && (
                  <div className="p-3 rounded-2xl bg-gradient-to-br from-[#f4fcff] to-[#d9eeff] border border-[#9fd4ff] space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="font-black text-[#09265f] text-sm">
                          🚀 อัพเกรด Rank
                        </div>
                        <div className="text-[11px] text-[#3f6493]">
                          {currentRank >= 18
                            ? 'ถึง Rank สูงสุด (R18) แล้ว'
                            : `เป้าหมายอัปเกรดถัดไป: Rank ${nextRank} (ใช้ ${nextRankPrice} USDT)`}
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="text-base font-black text-[#0754b9]">
                          {vaultPools.upgradeRankPool.toFixed(2)} U
                        </div>
                        <div className="text-[10px] font-bold text-rose-600">
                          ใช้อัปเกรดสะสม: -{vaultPools.upgradesDeductedUsdt.toFixed(2)} U
                        </div>
                      </div>
                    </div>
                    <SvgProgressBar percent={upgradePoolPct} variant="sky" heightClass="h-2.5" />
                  </div>
                )}

                {vaultPoolTab === 'auto_id' && (
                  <div className="p-3 rounded-2xl bg-gradient-to-br from-[#ecfff5] to-[#ccf7e2] border border-[#92e6bf] space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="font-black text-[#064e3b] text-sm">
                          👤 Auto ID
                        </div>
                        <div className="text-[11px] text-[#0f6b47] font-semibold">
                          สร้างแล้ว <strong>{totalAutoIds} รหัส</strong> · หักสร้างสะสม{' '}
                          <strong className="font-mono">
                            -{vaultPools.autoIdsDeductedUsdt.toFixed(2)} U
                          </strong>
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="text-base font-black text-emerald-700">
                          {vaultPools.newAutoIdPool.toFixed(2)} / 5.00 U
                        </div>
                        <div className="text-[10px] font-bold text-[#0f6b47]">
                          ความคืบหน้าใบถัดไป ({autoPoolPct.toFixed(0)}%)
                        </div>
                      </div>
                    </div>
                    <SvgProgressBar
                      percent={autoPoolPct}
                      variant="emerald"
                      heightClass="h-2.5"
                      trackClass="bg-[#a7e6c9]"
                    />

                    <div className="pt-1 space-y-1.5">
                      <div className="font-black text-[#064e3b] text-[11px]">
                        รายชื่อรหัส Auto ID ที่สร้างจากถังนี้ ({autoIdsSpawnedList.length} รหัส):
                      </div>
                      {autoIdsSpawnedList.length === 0 ? (
                        <div className="p-3 text-center rounded-xl bg-white/80 border border-[#a7e6c9] text-[#45725e]">
                          ยังไม่มีการสร้าง Auto ID จากถังนี้ (สะสมครบ 5.00 U จะสร้างให้อัตโนมัติ)
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-[210px] overflow-y-auto pr-1">
                          {autoIdsSpawnedList.map((a: any, idx: number) => {
                            const nodeId = Number(a.id || 0);
                            const rank = Number(a.rank || 1);
                            const price = Number(RANK_PRICES_USDT[rank - 1] || 5);
                            const sideTh = a.side === 'RIGHT' ? 'ฝั่งขวา' : 'ฝั่งซ้าย';
                            const txMatch = recentTransactions.find(
                              (t: any) =>
                                isRealChainTxHash(t?.txHash) &&
                                (t.id === `reg-r1-${nodeId}` ||
                                  (String(t.category || '').toUpperCase() === 'REGISTRATION' &&
                                    Number(t.mainNodeId) === nodeId))
                            );
                            return (
                              <div
                                key={`vault-auto-${nodeId}-${idx}`}
                                className="p-2.5 rounded-xl bg-white/95 border border-[#a7e6c9] flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-black text-[10px]">
                                      Auto ID #{nodeId}
                                    </span>
                                    <span className="font-mono font-bold text-[#09265f]">
                                      R{rank}-#{nodeId}
                                    </span>
                                    <span className="text-[10.5px] text-[#35567e]">
                                      · วางใต้ #{a.parentId || '-'} ({sideTh})
                                    </span>
                                  </div>
                                  <div className="text-[10px] font-mono text-[#4f7464]">
                                    🕒 {formatThaiDateTime(a.timestamp)}
                                  </div>
                                </div>
                                <div className="text-right shrink-0 space-y-1">
                                  <div className="font-mono font-black text-rose-600">
                                    -{price.toFixed(2)} U
                                  </div>
                                  <div className="flex items-center justify-end gap-1 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onSelectMainId(String(nodeId));
                                        setActiveModal(null);
                                      }}
                                      className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-300 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                                    >
                                      ดู ID #{nodeId}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        openDashboard2Matrix(rank, nodeId);
                                      }}
                                      className="px-2 py-0.5 rounded-md bg-[#e6f5ff] border border-[#9fd4ff] text-[10px] font-bold text-[#0756bc] hover:bg-[#d5eeff] cursor-pointer"
                                    >
                                      ผัง R{rank}
                                    </button>
                                    {txMatch?.txHash && (
                                      <a
                                        href={`https://bscscan.com/tx/${txMatch.txHash}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-[10px] text-[#087cf4] hover:underline inline-flex items-center gap-0.5"
                                      >
                                        TX <ExternalLink className="w-2.5 h-2.5" />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {vaultPoolTab === 'extra_id' && (
                  <div className="p-3 rounded-2xl bg-gradient-to-br from-[#faf5ff] to-[#e8d9ff] border border-[#cbaef9] space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="font-black text-[#4c1d95] text-sm">
                          ✦ Extra ID
                        </div>
                        <div className="text-[11px] text-[#5b21b6] font-semibold">
                          สร้างแล้ว <strong>{totalExtraIds} รหัส</strong> · หักสร้างสะสม{' '}
                          <strong className="font-mono">
                            -{vaultPools.extraIdsDeductedUsdt.toFixed(2)} U
                          </strong>{' '}
                          (สะสมรวม {vaultPools.newExtraIdPoolGross.toFixed(2)} U)
                        </div>
                      </div>
                      <div className="text-right font-mono">
                        <div className="text-base font-black text-violet-800">
                          {vaultPools.newExtraIdPool.toFixed(2)} U
                        </div>
                        <div className="text-[10px] font-bold text-[#5b21b6]">
                          คงเหลือพร้อมใช้ ({extraPoolPct.toFixed(0)}%)
                        </div>
                      </div>
                    </div>
                    <SvgProgressBar
                      percent={extraPoolPct}
                      variant="purple"
                      heightClass="h-2.5"
                      trackClass="bg-[#ccb3f7]"
                    />

                    <div className="pt-1 space-y-1.5">
                      <div className="font-black text-[#4c1d95] text-[11px]">
                        รายชื่อรหัส Extra ID ที่สร้างจากถังนี้ ({autoExtraIdsSpawnedList.length}{' '}
                        รหัส):
                      </div>
                      {autoExtraIdsSpawnedList.length === 0 ? (
                        <div className="p-3 text-center rounded-xl bg-white/80 border border-[#d6c2fa] text-[#5b21b6]">
                          ยังไม่มีการสร้าง Extra ID จากถังนี้
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-[210px] overflow-y-auto pr-1">
                          {autoExtraIdsSpawnedList.map((ex: any, idx: number) => {
                            const nodeId = Number(ex.id || 0);
                            const rank = Number(ex.rank || 2);
                            const price = Number(RANK_PRICES_USDT[rank - 1] || 10);
                            const sideTh = ex.side === 'RIGHT' ? 'ฝั่งขวา' : 'ฝั่งซ้าย';
                            return (
                              <div
                                key={`vault-extra-${rank}-${nodeId}-${idx}`}
                                className="p-2.5 rounded-xl bg-white/95 border border-[#d6c2fa] flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="px-2 py-0.5 rounded-md bg-violet-100 text-violet-800 font-black text-[10px]">
                                      Extra R{rank}-#{nodeId}
                                    </span>
                                    <span className="font-mono font-bold text-[#09265f]">
                                      Rank {rank}
                                    </span>
                                    <span className="text-[10.5px] text-[#35567e]">
                                      · วางใต้ #{ex.parentId || '-'} ({sideTh})
                                    </span>
                                  </div>
                                  <div className="text-[10px] font-mono text-[#6b4d9e]">
                                    🕒 {formatThaiDateTime(ex.timestamp)}
                                  </div>
                                </div>
                                <div className="text-right shrink-0 space-y-1">
                                  <div className="font-mono font-black text-rose-600">
                                    -{price.toFixed(2)} U
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      openDashboard2Matrix(rank, nodeId);
                                    }}
                                    className="px-2 py-0.5 rounded-md bg-violet-50 border border-violet-300 text-[10px] font-bold text-violet-700 hover:bg-violet-100 cursor-pointer"
                                  >
                                    ดูผัง Rank {rank}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Vault Ledger Header & IN/OUT Filter */}
                <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                  <div className="font-bold text-[#0754b9]">
                    สมุดบัญชี Vault เข้า/ออก{' '}
                    {vaultPoolTab === 'upgrade'
                      ? '(ถังอัปเกรด)'
                      : vaultPoolTab === 'auto_id'
                      ? '(ถัง Auto ID)'
                      : vaultPoolTab === 'extra_id'
                      ? '(ถัง Extra ID)'
                      : '(ทุกถัง)'}{' '}
                    ({filteredVaultLedger.length}):
                  </div>
                  <div className="flex items-center gap-1">
                    {(
                      [
                        { k: 'ALL', label: 'ทั้งหมด' },
                        { k: 'IN', label: 'เข้า (+)' },
                        { k: 'OUT', label: 'ออก (-)' },
                      ] as const
                    ).map((df) => (
                      <button
                        key={df.k}
                        type="button"
                        onClick={() => setVaultDirectionFilter(df.k)}
                        className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold border cursor-pointer ${
                          vaultDirectionFilter === df.k
                            ? 'bg-[#087cf4] text-white border-[#087cf4]'
                            : 'bg-white text-[#0756bc] border-[#b8e5ff]'
                        }`}
                      >
                        {df.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                  {filteredVaultLedger.length === 0 ? (
                    <div className="p-4 text-center rounded-xl bg-white/80 border border-[#b8e5ff] text-[#55769b]">
                      ไม่มีรายการเคลื่อนไหวในหมวดที่เลือกสำหรับ ID #{displayId}
                    </div>
                  ) : (
                    filteredVaultLedger.map((item: any, idx: number) => {
                      const fallbackSrc = deriveSourceStatusInfo(
                        item.fromNodeType,
                        Number(item.fromNodeId || 0),
                        Number(item.fromMainId || 0),
                        Number(item.rank || 1)
                      );
                      const srcIdLabel = String(item.fromNodeType || fallbackSrc.idLabel || '').trim();
                      const srcStatusLabel = String(
                        item.sourceStatusTh ||
                          (item.direction === 'OUT' ? 'หักจาก Vault' : fallbackSrc.statusTh)
                      ).trim();
                      const statusTone =
                        item.direction === 'OUT'
                          ? 'bg-rose-50 border-rose-200 text-rose-700'
                          : srcStatusLabel.includes('Clone')
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : srcStatusLabel.includes('Extra')
                          ? 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700'
                          : srcStatusLabel.includes('Auto')
                          ? 'bg-amber-50 border-amber-200 text-amber-800'
                          : 'bg-sky-50 border-sky-200 text-[#0754b9]';

                      return (
                        <div
                          key={`vl-${item.id || idx}`}
                          className="p-2.5 rounded-xl bg-white border border-[#b8e5ff] flex items-start justify-between gap-2"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9.5px] font-black ${
                                  item.direction === 'OUT'
                                    ? 'bg-rose-100 text-rose-700'
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}
                              >
                                {item.direction === 'OUT' ? 'OUT' : 'IN'}
                              </span>
                              <span className="font-bold text-[#09265f]">
                                {item.actionLabelTh || item.poolLabelTh || item.poolType} · R
                                {item.rank}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                              {srcIdLabel && (
                                <span className="px-1.5 py-0.5 rounded bg-[#eff7ff] border border-[#b8e5ff] font-mono font-bold text-[#0754b9]">
                                  {item.direction === 'OUT' ? 'รายการ:' : 'มาจากไอดี:'} {srcIdLabel}
                                </span>
                              )}
                              <span className={`px-1.5 py-0.5 rounded border font-bold ${statusTone}`}>
                                สถานะ: {srcStatusLabel}
                              </span>
                              {item.direction === 'IN' && Number(item.toNodeId || 0) > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 font-mono font-semibold text-slate-700">
                                  ใต้โหนด #{item.toNodeId}
                                </span>
                              )}
                              {item.targetStatusTh && (
                                <span className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 font-bold text-indigo-700">
                                  {item.targetStatusTh}
                                </span>
                              )}
                            </div>
                            <div className="text-[10.5px] text-[#45668f] leading-snug break-words">
                              {item.descriptionTh || item.note}
                            </div>
                            <div className="text-[9.5px] font-mono text-[#6b8cb3]">
                              🕒 {formatThaiDateTime(item.timestamp)}
                            </div>
                          </div>
                          <div className="text-right shrink-0 font-mono">
                            <strong
                              className={`font-black block ${
                                item.direction === 'OUT' ? 'text-rose-600' : 'text-emerald-700'
                              }`}
                            >
                              {item.direction === 'OUT' ? '-' : '+'}
                              {Number(item.amountUsdt || 0).toFixed(2)} U
                            </strong>
                            {vaultPoolTab !== 'all' && typeof item.poolBalanceAfterUsdt === 'number' ? (
                              <span className="text-[9.5px] text-[#55769b] block">
                                คงเหลือถังนี้ {Number(item.poolBalanceAfterUsdt).toFixed(2)} U
                              </span>
                            ) : typeof item.balanceAfterUsdt === 'number' ? (
                              <span className="text-[9.5px] text-[#55769b] block">
                                คงเหลือรวม {Number(item.balanceAfterUsdt).toFixed(2)} U
                                {typeof item.poolBalanceAfterUsdt === 'number'
                                  ? ` · ถังนี้ ${Number(item.poolBalanceAfterUsdt).toFixed(2)} U`
                                  : ''}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* MODAL: ALLSELL 4 POOLS */}
            {activeModal === 'allsell' && (
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-white border border-[#b8e5ff] flex items-center justify-between">
                  <div>
                    <div className="font-bold text-[#0754b9]">กองทุน AllSell รวมทุกแรงค์ (4%)</div>
                    <div className="text-[11px] text-[#55769b]">
                      ประมาณการส่วนแบ่งของคุณ:{' '}
                      <strong className="text-emerald-700">
                        +{Number(activeReport?.allSellQualification?.estimatedAllSellShareUsdt || 0).toFixed(2)} U
                      </strong>
                    </div>
                  </div>
                  <strong className="text-lg font-black text-[#09265f] font-mono">
                    +{Number(systemPools?.allSellTotalUsdt || 0).toFixed(2)} U
                  </strong>
                </div>

                <div className="space-y-2">
                  {(() => {
                    const pool1Passed = Boolean(
                      allSellPools.find((x: any) => Number(x.poolNumber) === 1)?.isQualified
                    );
                    return allSellPools.map((pool: any) => {
                      const poolNum = Number(pool.poolNumber || 1);
                      const isQualified =
                        poolNum === 1
                          ? Boolean(pool.isQualified)
                          : pool1Passed && Boolean(pool.isQualified);
                      const blockedByPool1 =
                        poolNum > 1 && !pool1Passed && Boolean(pool.blockedByPool1 || !isQualified);
                      return (
                        <div
                          key={pool.key}
                          className={`p-3 rounded-xl border ${
                            isQualified
                              ? 'bg-emerald-50 border-emerald-300'
                              : 'bg-white border-[#b8e5ff]'
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold">
                            <span>{pool.titleTh}</span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] ${
                                isQualified
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {isQualified ? 'ผ่านเกณฑ์รับสิทธิ์ ✓' : 'ยังไม่ผ่านเกณฑ์'}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-[#45668f] flex items-center justify-between flex-wrap gap-1">
                            <span>
                              ตัวคุณอยู่ R{currentRank} ({pool.hasSelfRank ? '✓ ถึงเกณฑ์' : `ต้องถึง R${pool.requiredSelfRank}`}) · แนะนำตรง ({pool.allowedDirectRanksLabel}):{' '}
                              <strong>
                                {pool.qualifiedDirectCount}/{pool.requiredDirectCount} IDs
                              </strong>
                              {blockedByPool1 && (
                                <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[9.5px] font-bold">
                                  ต้องผ่านกองที่ 1 ก่อน
                                </span>
                              )}
                            </span>
                            <strong className="font-mono text-[#0754b9]">
                              ยอดกอง: {Number(pool.poolTotalUsdt || 0).toFixed(2)} U
                            </strong>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
            {/* MODAL: 18-RANK MEMBER TABLE POPUP */}
            {activeModal === 'ranks_18' && (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap px-0.5 text-[11px] font-semibold text-[#3f6493] tabular-nums">
                  <span>
                    ปลดล็อกแล้ว {currentRank} / 18 Rank · Rank ปัจจุบัน R{currentRank} · แตะการ์ดเพื่อเปิดผัง Matrix
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setMembersSelectedRank('all');
                      setActiveModal('members');
                    }}
                    className="min-h-[36px] px-2.5 py-1 rounded-xl bg-white border border-[#9fd4ff] text-[11px] font-bold text-[#0756bc] hover:bg-[#eef8ff] cursor-pointer"
                  >
                    👥 ดูสมาชิกแยก Rank ›
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Array.from({ length: 18 }, (_, i) => i + 1).map((n) =>
                    renderRankCard(n, 'modal')
                  )}
                </div>

                <p className="text-[10px] text-[#54759c] leading-relaxed">
                  สมาชิกใน Rank = จำนวนโหนดจริงใน Rank นั้นจากระบบ · Direct Sponsor (*) = เกณฑ์ผู้แนะนำตรงสำหรับสิทธิ์รับกองทุน AllSell (R11: 5 IDs ใน R8-11 · R14: 2 IDs ใน R12-14 · R16: 2 IDs ใน R14-16 · R18: 5 IDs ใน R16-18 โดยต้องผ่านเกณฑ์กองที่ 1 ก่อน)
                </p>

                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="w-full min-h-[44px] rounded-xl bg-white hover:bg-blue-50 border border-[#9fd4ff] text-[#0756bc] font-bold text-xs cursor-pointer"
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
