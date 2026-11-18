import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  Search,
  UserPlus,
  Wallet,
  Crown,
  Sparkles,
  Copy,
  Layers,
  GitBranch,
  ArrowUpRight,
  X,
} from 'lucide-react';
import { FractalFlowBrandCard } from './FractalFlowLogo';
import { RANK_PRICES_USDT } from '../contracts/config';

export type IdVaultCategory = 'ALL' | 'MAIN' | 'AUTO' | 'EXTRA' | 'CLONE';
export type IdVaultScope = 'MY_WALLET' | 'SYSTEM';
export type IdVaultSortKey = 'id_asc' | 'rank_desc' | 'earned_desc' | 'vault_desc';

export interface IdVaultItem {
  uniqueKey: string;
  category: 'MAIN' | 'AUTO' | 'EXTRA' | 'CLONE';
  id: number;
  mainId: number;
  rank: number;
  title: string;
  subtitle: string;
  badge: string;
  owner: string;
  directSponsorNodeId: number;
  parentId: number;
  side: string;
  cloneRound?: number;
  cloneSequence?: number;
  direct30TotalUsdt: number;
  level30TotalUsdt: number;
  totalEarnedUsdt: number;
  vaultRemainingUsdt: number;
  vaultGrossUsdt: number;
  upgradeRankPoolUsdt: number;
  newAutoIdPoolUsdt: number;
  newExtraIdPoolUsdt: number;
  subAutoCount: number;
  subExtraCount: number;
  subCloneCount: number;
  isOwnedByConnectedWallet: boolean;
  timestamp?: string;
}

interface Dashboard2IdVaultPanelProps {
  account: string | null;
  usdtBalance: string;
  bnbBalance: string;
  profile: any;
  reports: any[];
  displayId: number;
  effectiveMainId: number;
  selectedSubIdTarget: {
    kind: 'CLONE' | 'EXTRA';
    rank: number;
    nodeId: number;
    mainId: number;
  } | null;
  isSyncing?: boolean;
  onRefresh: () => void;
  onConnectWallet: () => void;
  onOpenRegisterModal: () => void;
  onBackToHome: () => void;
  onSelectMainId: (mainId: number) => void;
  onSelectSubId: (target: {
    kind: 'CLONE' | 'EXTRA';
    rank: number;
    nodeId: number;
    mainId: number;
  }) => void;
  onOpenMatrixForNode: (rank: number, nodeId: number, subTarget?: {
    kind: 'CLONE' | 'EXTRA';
    rank: number;
    nodeId: number;
    mainId: number;
  } | null) => void;
  onOpenUnilevelForNode: (nodeId: number, mainId: number, subTarget?: {
    kind: 'CLONE' | 'EXTRA';
    rank: number;
    nodeId: number;
    mainId: number;
  } | null) => void;
  onOpenUpgradeForMainId?: (mainId: number) => void;
}

const fmtNum = (n: number): string => n.toLocaleString('en-US');

const shortAddr = (addr?: string): string => {
  if (!addr || addr === '0x0000000000000000000000000000000000000000') return '—';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

export const Dashboard2IdVaultPanel: React.FC<Dashboard2IdVaultPanelProps> = ({
  account,
  usdtBalance,
  bnbBalance,
  profile,
  reports = [],
  displayId,
  effectiveMainId,
  selectedSubIdTarget,
  isSyncing = false,
  onRefresh,
  onConnectWallet,
  onOpenRegisterModal,
  onBackToHome,
  onSelectMainId,
  onSelectSubId,
  onOpenMatrixForNode,
  onOpenUnilevelForNode,
  onOpenUpgradeForMainId,
}) => {
  const [scope, setScope] = useState<IdVaultScope>(account ? 'MY_WALLET' : 'SYSTEM');
  const [categoryFilter, setCategoryFilter] = useState<IdVaultCategory>('ALL');
  const [rankFilter, setRankFilter] = useState<number | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<IdVaultSortKey>('id_asc');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string>('');

  const walletLower = (account || '').toLowerCase();

  const profileOwnedMainSet = useMemo(
    () =>
      new Set<number>(
        (profile?.ownedMainIdsRank1 || [])
          .map((id: any) => Number(id))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      ),
    [profile?.ownedMainIdsRank1]
  );

  const profileOwnedCloneSet = useMemo(
    () =>
      new Set<number>(
        (profile?.ownedCloneIdsRank1 || [])
          .map((id: any) => Number(id))
          .filter((n: number) => Number.isFinite(n) && n > 0)
      ),
    [profile?.ownedCloneIdsRank1]
  );

  // Build normalized inventory of ALL Main IDs, Auto IDs, Extra IDs, and Clone IDs in reports
  const allItems = useMemo<IdVaultItem[]>(() => {
    const items: IdVaultItem[] = [];
    const seenMainAuto = new Set<number>();
    const seenExtra = new Set<string>();
    const seenClone = new Set<string>();

    for (const r of reports) {
      if (!r) continue;
      const repOwner = String(r.owner || '');
      const repOwnerLower = repOwner.toLowerCase();
      const numId = Number(r.id || 0);
      if (numId <= 0) continue;

      if (!r.isClone && !r.isExtraId) {
        if (!seenMainAuto.has(numId)) {
          seenMainAuto.add(numId);
          const isAuto = Boolean(r.isAutoId);
          const isOwned = Boolean(
            walletLower && (repOwnerLower === walletLower || profileOwnedMainSet.has(numId))
          );
          const d30 = Number(r.direct30TotalUsdt || 0);
          const l30 = Number(r.level30TotalUsdt || 0);
          const totalEarned = Number((r.totalEarnedUsdt ?? d30 + l30) || 0);
          const upPool = Number(r.upgradeRankPool || 0);
          const autoPool = Number(r.newAutoIdPool || 0);
          const extraPool = Number(r.newExtraIdPool || 0);
          const remaining = Number(
            (r.vault35RemainingTotalUsdt ?? upPool + autoPool + extraPool) || 0
          );

          items.push({
            uniqueKey: `${isAuto ? 'AUTO' : 'MAIN'}-${numId}`,
            category: isAuto ? 'AUTO' : 'MAIN',
            id: numId,
            mainId: numId,
            rank: Math.max(1, Math.min(18, Number(r.currentMaxRank || 1))),
            title: isAuto ? `Auto ID #${numId}` : `Main ID #${numId}`,
            subtitle: isAuto
              ? `แตกจากถัง Auto ID ของ Main #${Number(r.spawnedByMainId || r.directSponsorNodeId || 1)}`
              : numId === 1
              ? 'รหัสต้นสายหลักของระบบ'
              : `ผู้แนะนำ #${Number(r.directSponsorNodeId || 1)}`,
            badge: isAuto ? 'AUTO ID' : 'MAIN ID',
            owner: repOwner,
            directSponsorNodeId: Number(r.directSponsorNodeId || (numId === 1 ? 0 : 1)),
            parentId: Number(r.parentId || 0),
            side: String(r.side || r.sideInR1 || ''),
            direct30TotalUsdt: Number(d30.toFixed(2)),
            level30TotalUsdt: Number(l30.toFixed(2)),
            totalEarnedUsdt: Number(totalEarned.toFixed(2)),
            vaultRemainingUsdt: Number(remaining.toFixed(2)),
            vaultGrossUsdt: Number(Number(r.vault35GrossTotalUsdt || 0).toFixed(2)),
            upgradeRankPoolUsdt: Number(upPool.toFixed(2)),
            newAutoIdPoolUsdt: Number(autoPool.toFixed(2)),
            newExtraIdPoolUsdt: Number(extraPool.toFixed(2)),
            subAutoCount: Number(r.totalAutoIdCount ?? (r.autoIdsSpawned || []).length ?? 0),
            subExtraCount: Number(r.totalExtraIdCount ?? (r.autoExtraIdsSpawned || []).length ?? 0),
            subCloneCount: Number(r.totalClonesCount ?? (r.clonesSpawned || []).length ?? 0),
            isOwnedByConnectedWallet: isOwned,
          });
        }

        // Extra IDs spawned by this report across all ranks
        for (const ex of r.autoExtraIdsSpawned || []) {
          const exId = Number(ex.id || 0);
          const exRank = Number(ex.rank || 2);
          if (exId <= 0) continue;
          const exKey = `${exRank}-${exId}`;
          if (seenExtra.has(exKey)) continue;
          seenExtra.add(exKey);

          const exOwner = String(ex.owner || repOwner);
          const exOwnerLower = exOwner.toLowerCase();
          const parentMain = Number(ex.mainId || numId || 1);
          const isOwned = Boolean(
            walletLower &&
              (exOwnerLower === walletLower ||
                repOwnerLower === walletLower ||
                profileOwnedMainSet.has(parentMain))
          );
          const d30 = Number(ex.direct30TotalUsdt || 0);
          const l30 = Number(ex.level30TotalUsdt || 0);
          const v35 = Number(ex.vault35GrossTotalUsdt || 0);

          items.push({
            uniqueKey: `EXTRA-${exRank}-${exId}`,
            category: 'EXTRA',
            id: exId,
            mainId: parentMain,
            rank: exRank,
            title: `Extra R${exRank}-#${exId}`,
            subtitle: `จากถัง Extra ของ Main #${parentMain}`,
            badge: 'EXTRA ID',
            owner: exOwner,
            directSponsorNodeId: Number(ex.directSponsorNodeId || parentMain),
            parentId: Number(ex.parentId || 0),
            side: String(ex.side || ''),
            direct30TotalUsdt: Number(d30.toFixed(2)),
            level30TotalUsdt: Number(l30.toFixed(2)),
            totalEarnedUsdt: Number((d30 + l30).toFixed(2)),
            vaultRemainingUsdt: 0,
            vaultGrossUsdt: Number(v35.toFixed(2)),
            upgradeRankPoolUsdt: 0,
            newAutoIdPoolUsdt: 0,
            newExtraIdPoolUsdt: 0,
            subAutoCount: 0,
            subExtraCount: 0,
            subCloneCount: 0,
            isOwnedByConnectedWallet: isOwned,
            timestamp: ex.timestamp,
          });
        }

        // Clones spawned by this report across all ranks
        for (const c of r.clonesSpawned || []) {
          const cId = Number(c.id || 0);
          const cRank = Number(c.rank || 1);
          if (cId <= 0) continue;
          const cKey = `${cRank}-${cId}`;
          if (seenClone.has(cKey)) continue;
          seenClone.add(cKey);

          const cOwner = String(c.owner || repOwner);
          const cOwnerLower = cOwner.toLowerCase();
          const parentMain = Number(c.mainId || numId || 1);
          const r1Fallback =
            cRank === 1 ? reports.find((rr) => rr.isClone && Number(rr.id) === cId) : null;

          const isOwned = Boolean(
            walletLower &&
              (cOwnerLower === walletLower ||
                repOwnerLower === walletLower ||
                profileOwnedMainSet.has(parentMain) ||
                (cRank === 1 && profileOwnedCloneSet.has(cId)))
          );
          const d30 = Number(c.direct30TotalUsdt ?? r1Fallback?.direct30TotalUsdt ?? 0);
          const l30 = Number(c.level30TotalUsdt ?? r1Fallback?.level30TotalUsdt ?? 0);
          const v35 = Number(c.vault35GrossTotalUsdt ?? r1Fallback?.vault35GrossTotalUsdt ?? 0);
          const seq = Number(c.cloneSequence || r1Fallback?.cloneSequence || 1);
          const round = Number(c.cloneRound || r1Fallback?.cloneRound || 1);

          items.push({
            uniqueKey: `CLONE-${cRank}-${cId}`,
            category: 'CLONE',
            id: cId,
            mainId: parentMain,
            rank: cRank,
            title: `โคลน #${parentMain} · ครั้งที่ ${seq}`,
            subtitle: `โหนด R${cRank}-#${cId} · รอบ ${round} (Rebirth 100%)`,
            badge: 'CLONE ID',
            owner: cOwner,
            directSponsorNodeId: Number(c.directSponsorNodeId || r.directSponsorNodeId || 1),
            parentId: Number(c.parentId || r1Fallback?.parentId || 0),
            side: String(c.side || r1Fallback?.side || ''),
            cloneRound: round,
            cloneSequence: seq,
            direct30TotalUsdt: Number(d30.toFixed(2)),
            level30TotalUsdt: Number(l30.toFixed(2)),
            totalEarnedUsdt: Number((d30 + l30).toFixed(2)),
            vaultRemainingUsdt: 0,
            vaultGrossUsdt: Number(v35.toFixed(2)),
            upgradeRankPoolUsdt: 0,
            newAutoIdPoolUsdt: 0,
            newExtraIdPoolUsdt: 0,
            subAutoCount: 0,
            subExtraCount: 0,
            subCloneCount: 0,
            isOwnedByConnectedWallet: isOwned,
            timestamp: c.timestamp,
          });
        }
      } else if (r.isClone) {
        // Standalone Rank 1 clone report fallback
        const cId = numId;
        const cKey = `1-${cId}`;
        if (!seenClone.has(cKey)) {
          seenClone.add(cKey);
          const parentMain = Number(r.originMainId || 1);
          const isOwned = Boolean(
            walletLower &&
              (repOwnerLower === walletLower ||
                profileOwnedMainSet.has(parentMain) ||
                profileOwnedCloneSet.has(cId))
          );
          const d30 = Number(r.direct30TotalUsdt || 0);
          const l30 = Number(r.level30TotalUsdt || 0);
          const v35 = Number(r.vault35GrossTotalUsdt || 0);
          const seq = Number(r.cloneSequence || 1);
          const round = Number(r.cloneRound || 1);

          items.push({
            uniqueKey: `CLONE-1-${cId}`,
            category: 'CLONE',
            id: cId,
            mainId: parentMain,
            rank: 1,
            title: `โคลน #${parentMain} · ครั้งที่ ${seq}`,
            subtitle: `โหนด R1-#${cId} · รอบ ${round} (Rebirth 100%)`,
            badge: 'CLONE ID',
            owner: repOwner,
            directSponsorNodeId: Number(r.directSponsorNodeId || 1),
            parentId: Number(r.parentId || 0),
            side: String(r.side || r.sideInR1 || ''),
            cloneRound: round,
            cloneSequence: seq,
            direct30TotalUsdt: Number(d30.toFixed(2)),
            level30TotalUsdt: Number(l30.toFixed(2)),
            totalEarnedUsdt: Number((d30 + l30).toFixed(2)),
            vaultRemainingUsdt: 0,
            vaultGrossUsdt: Number(v35.toFixed(2)),
            upgradeRankPoolUsdt: 0,
            newAutoIdPoolUsdt: 0,
            newExtraIdPoolUsdt: 0,
            subAutoCount: 0,
            subExtraCount: 0,
            subCloneCount: 0,
            isOwnedByConnectedWallet: isOwned,
          });
        }
      }
    }

    // Ensure profile.ownedMainIdsRank1 entries exist even before reports sync
    if (account) {
      for (const ownId of profileOwnedMainSet) {
        if (!seenMainAuto.has(ownId)) {
          seenMainAuto.add(ownId);
          items.push({
            uniqueKey: `MAIN-${ownId}`,
            category: 'MAIN',
            id: ownId,
            mainId: ownId,
            rank: Math.max(1, Number(profile?.currentMaxRank || 1)),
            title: `Main ID #${ownId}`,
            subtitle: `ผู้แนะนำ #${Number(profile?.sponsorMainNodeId || 1)}`,
            badge: 'MAIN ID',
            owner: account,
            directSponsorNodeId: Number(profile?.sponsorMainNodeId || 1),
            parentId: 0,
            side: '',
            direct30TotalUsdt: 0,
            level30TotalUsdt: 0,
            totalEarnedUsdt: 0,
            vaultRemainingUsdt: 0,
            vaultGrossUsdt: 0,
            upgradeRankPoolUsdt: 0,
            newAutoIdPoolUsdt: 0,
            newExtraIdPoolUsdt: 0,
            subAutoCount: 0,
            subExtraCount: 0,
            subCloneCount: 0,
            isOwnedByConnectedWallet: true,
          });
        }
      }
    }

    return items;
  }, [reports, walletLower, account, profileOwnedMainSet, profileOwnedCloneSet, profile?.currentMaxRank, profile?.sponsorMainNodeId]);

  const myWalletItems = useMemo(
    () => allItems.filter((item) => item.isOwnedByConnectedWallet),
    [allItems]
  );

  const effectiveScope: IdVaultScope = account ? scope : 'SYSTEM';
  const scopeBaseItems = effectiveScope === 'MY_WALLET' ? myWalletItems : allItems;

  const scopeStats = useMemo(() => {
    let mainCount = 0;
    let autoCount = 0;
    let extraCount = 0;
    let cloneCount = 0;
    let earnedTotal = 0;
    let vaultRemainingTotal = 0;
    for (const it of scopeBaseItems) {
      if (it.category === 'MAIN') mainCount++;
      else if (it.category === 'AUTO') autoCount++;
      else if (it.category === 'EXTRA') extraCount++;
      else if (it.category === 'CLONE') cloneCount++;
      earnedTotal += it.totalEarnedUsdt;
      vaultRemainingTotal += it.vaultRemainingUsdt;
    }
    return {
      totalCount: scopeBaseItems.length,
      mainCount,
      autoCount,
      extraCount,
      cloneCount,
      earnedTotal: Number(earnedTotal.toFixed(2)),
      vaultRemainingTotal: Number(vaultRemainingTotal.toFixed(2)),
    };
  }, [scopeBaseItems]);

  const filteredItems = useMemo(() => {
    const rawQ = searchQuery.trim();
    const cloneRoundMatch = rawQ.match(
      /^(?:id\s*#?|#)?(\d+)\s*(?:โคลน(?:นิ่ง)?\s*)?(?:ครั้ง(?:ที่)?|รอบ)\s*[:#-]?\s*(\d+)$/i
    );
    const idOnlyMatch = rawQ.match(/^(?:id\s*#?|#)?(\d+)$/i);
    const qLower = rawQ.toLowerCase();

    const list = scopeBaseItems.filter((item) => {
      if (categoryFilter !== 'ALL' && item.category !== categoryFilter) return false;
      if (rankFilter !== 'ALL' && item.rank !== rankFilter) return false;
      if (!rawQ) return true;

      if (cloneRoundMatch) {
        const targetMain = Number(cloneRoundMatch[1]);
        const targetSeq = Number(cloneRoundMatch[2]);
        return (
          item.category === 'CLONE' &&
          item.mainId === targetMain &&
          Number(item.cloneSequence || 0) === targetSeq
        );
      }

      if (idOnlyMatch) {
        const targetNum = Number(idOnlyMatch[1]);
        return item.id === targetNum || item.mainId === targetNum;
      }

      const hay = [
        item.title,
        item.subtitle,
        item.badge,
        `#${item.id}`,
        `#${item.mainId}`,
        `rank ${item.rank}`,
        `r${item.rank}`,
        item.owner,
        item.category === 'CLONE' ? `โคลน ครั้งที่ ${item.cloneSequence || 1}` : '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(qLower);
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'rank_desc') {
        if (b.rank !== a.rank) return b.rank - a.rank;
        return a.id - b.id;
      }
      if (sortBy === 'earned_desc') {
        if (b.totalEarnedUsdt !== a.totalEarnedUsdt) return b.totalEarnedUsdt - a.totalEarnedUsdt;
        return a.id - b.id;
      }
      if (sortBy === 'vault_desc') {
        if (b.vaultRemainingUsdt !== a.vaultRemainingUsdt) {
          return b.vaultRemainingUsdt - a.vaultRemainingUsdt;
        }
        return b.id - a.id;
      }
      // id_asc default: Main/Auto first or sort naturally by mainId -> category -> rank -> id
      if (a.mainId !== b.mainId) return a.mainId - b.mainId;
      const order = { MAIN: 0, AUTO: 1, EXTRA: 2, CLONE: 3 };
      if (order[a.category] !== order[b.category]) return order[a.category] - order[b.category];
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.id - b.id;
    });
  }, [scopeBaseItems, categoryFilter, rankFilter, searchQuery, sortBy]);

  const handleCopyWallet = (addr: string, key: string) => {
    if (!addr || typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(addr).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((prev) => (prev === key ? '' : prev)), 1500);
  };

  const isItemCurrentlyActive = (item: IdVaultItem): boolean => {
    if (selectedSubIdTarget) {
      if (item.category === 'CLONE' && selectedSubIdTarget.kind === 'CLONE') {
        return selectedSubIdTarget.rank === item.rank && selectedSubIdTarget.nodeId === item.id;
      }
      if (item.category === 'EXTRA' && selectedSubIdTarget.kind === 'EXTRA') {
        return selectedSubIdTarget.rank === item.rank && selectedSubIdTarget.nodeId === item.id;
      }
      return false;
    }
    return (item.category === 'MAIN' || item.category === 'AUTO') && item.id === displayId;
  };

  return (
    <div className="space-y-3 sm:space-y-3.5 min-w-0 max-w-full">
      {/* 1. SAPPHIRE TOP HEADER */}
      <section className="mx-0.5 sm:mx-1 p-3 sm:p-5 text-white rounded-[22px] sm:rounded-[24px] bg-[radial-gradient(ellipse_at_85%_90%,rgba(71,225,255,0.42),transparent_40%),linear-gradient(120deg,#031c5c,#075ed0_65%,#031d61)] shadow-[0_8px_24px_rgba(0,60,155,0.4)] border border-[#42bfff]/60 min-w-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 sm:gap-2.5 flex-wrap min-w-0">
          <div className="min-w-0">
            <FractalFlowBrandCard size="md" />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap min-w-0 max-w-full">
            <span className="px-2.5 py-1 rounded-full bg-[#ffdf6d] text-[#09265f] text-[10.5px] sm:text-[11px] font-black whitespace-nowrap">
              ◈ คลังไอดีทั้งหมด · ID Vault
            </span>
            {account ? (
              <span className="px-2.5 sm:px-3 py-1 rounded-full bg-white/15 border border-[#9eeaff] text-[11px] font-bold whitespace-nowrap font-mono tabular-nums">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-1.5" />
                {shortAddr(account)} · {Number(usdtBalance || 0).toFixed(2)} U
              </span>
            ) : (
              <button
                type="button"
                onClick={onConnectWallet}
                className="px-2.5 py-1.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-[#06285a] text-[11px] font-black inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Wallet className="w-3.5 h-3.5" /> เชื่อมต่อกระเป๋า
              </button>
            )}
            <button
              type="button"
              onClick={onOpenRegisterModal}
              className="px-2.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 border border-emerald-200/70 text-slate-950 text-[11px] font-black inline-flex items-center gap-1 whitespace-nowrap cursor-pointer shadow-xs"
            >
              <UserPlus className="w-3.5 h-3.5" /> สมัคร/เพิ่ม ID
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="p-2 rounded-xl bg-white/15 hover:bg-white/25 border border-cyan-300/40 text-white cursor-pointer"
              title="รีเฟรชข้อมูลคลังไอดี"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onBackToHome}
              className="px-2.5 py-1.5 rounded-xl bg-white text-[#0754b9] text-[11px] font-black inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <ArrowLeft className="w-3 h-3" /> กลับหน้าหลัก
            </button>
          </div>
        </div>

        {/* Scope Switcher: Connected Wallet vs System All */}
        <div className="mt-3 pt-3 border-t border-white/15 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setScope('MY_WALLET')}
              disabled={!account}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer inline-flex items-center gap-1.5 ${
                effectiveScope === 'MY_WALLET'
                  ? 'bg-[#ffdf6d] text-[#09265f] shadow-md'
                  : account
                  ? 'bg-white/15 text-white hover:bg-white/25 border border-cyan-200/40'
                  : 'bg-white/5 text-white/40 border border-white/10 cursor-not-allowed'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>ไอดีในกระเป๋าฉัน ({fmtNum(myWalletItems.length)} รหัส)</span>
            </button>
            <button
              type="button"
              onClick={() => setScope('SYSTEM')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer inline-flex items-center gap-1.5 ${
                effectiveScope === 'SYSTEM'
                  ? 'bg-[#ffdf6d] text-[#09265f] shadow-md'
                  : 'bg-white/15 text-white hover:bg-white/25 border border-cyan-200/40'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>คลังไอดีทั้งระบบ ({fmtNum(allItems.length)} รหัส)</span>
            </button>
          </div>

          <div className="text-[11px] font-mono text-cyan-100">
            {account
              ? `Gas: ${Number(bnbBalance || 0).toFixed(4)} tBNB · กำลังดู: #${displayId}`
              : 'แสดงโหมดทั้งระบบ (เชื่อมต่อกระเป๋าเพื่อกรองเฉพาะ ID ของคุณ)'}
          </div>
        </div>

        {/* 4 Summary KPI Cards */}
        <div className="mt-3 pt-3 border-t border-white/15 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs tabular-nums">
          <div className="p-2.5 rounded-xl bg-white/10 border border-white/15">
            <div className="text-[10px] text-cyan-100/90">Main ID / Auto ID</div>
            <div className="text-base sm:text-lg font-black text-[#ffdf6d] font-mono">
              {fmtNum(scopeStats.mainCount + scopeStats.autoCount)}{' '}
              <span className="text-[11px] font-bold text-white/85">
                (Main {scopeStats.mainCount} · Auto {scopeStats.autoCount})
              </span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-white/10 border border-white/15">
            <div className="text-[10px] text-cyan-100/90">Extra ID (R4–R18 Pool)</div>
            <div className="text-base sm:text-lg font-black text-violet-200 font-mono">
              {fmtNum(scopeStats.extraCount)}{' '}
              <span className="text-[11px] font-bold text-white/80">รหัส</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-white/10 border border-white/15">
            <div className="text-[10px] text-cyan-100/90">โคลนนิ่ง (Clone ID)</div>
            <div className="text-base sm:text-lg font-black text-emerald-300 font-mono">
              {fmtNum(scopeStats.cloneCount)}{' '}
              <span className="text-[11px] font-bold text-white/80">ใบ</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-white/10 border border-white/15">
            <div className="text-[10px] text-cyan-100/90">รายได้รวม / Vault คงเหลือ</div>
            <div className="text-sm sm:text-base font-black text-white font-mono leading-snug">
              <span className="text-emerald-300">+{scopeStats.earnedTotal.toFixed(2)} U</span>
              <span className="block text-[10.5px] font-bold text-cyan-100">
                Vault {scopeStats.vaultRemainingTotal.toFixed(2)} U
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. SEARCH, CATEGORY FILTER & SORT BAR */}
      <section className="mx-0.5 sm:mx-1 p-3 sm:p-4 rounded-[20px] bg-white/95 border border-[#b8e1ff] shadow-[0_6px_18px_rgba(7,85,181,0.14)] space-y-2.5 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* Category Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(
              [
                { k: 'ALL', label: `ทั้งหมด (${scopeStats.totalCount})` },
                { k: 'MAIN', label: `Main (${scopeStats.mainCount})` },
                { k: 'AUTO', label: `Auto (${scopeStats.autoCount})` },
                { k: 'EXTRA', label: `Extra (${scopeStats.extraCount})` },
                { k: 'CLONE', label: `โคลน (${scopeStats.cloneCount})` },
              ] as const
            ).map((tab) => {
              const active = categoryFilter === tab.k;
              return (
                <button
                  key={`idv-cat-${tab.k}`}
                  type="button"
                  onClick={() => setCategoryFilter(tab.k)}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold transition cursor-pointer ${
                    active
                      ? 'bg-[#087cf4] text-white shadow-xs'
                      : 'bg-[#edf7ff] text-[#0754b9] border border-[#b8ddff] hover:bg-[#dff1ff]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <select
              value={rankFilter}
              onChange={(e) =>
                setRankFilter(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))
              }
              className="px-2.5 py-1.5 rounded-xl border border-[#b5dbff] bg-[#f4faff] text-[11px] font-bold text-[#0754b9] cursor-pointer"
            >
              <option value="ALL">ทุก Rank (R1–R18)</option>
              {RANK_PRICES_USDT.map((price, idx) => (
                <option key={`idv-r-${idx + 1}`} value={idx + 1}>
                  Rank {idx + 1} ({fmtNum(price)} U)
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as IdVaultSortKey)}
              className="px-2.5 py-1.5 rounded-xl border border-[#b5dbff] bg-[#f4faff] text-[11px] font-bold text-[#0754b9] cursor-pointer"
            >
              <option value="id_asc">เรียงตามรหัส ID</option>
              <option value="rank_desc">Rank สูงสุดก่อน</option>
              <option value="earned_desc">รายได้สูงสุดก่อน</option>
              <option value="vault_desc">Vault คงเหลือสูงสุด</option>
            </select>
          </div>
        </div>

        {/* Search Input */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-[#4f74a3] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหา #ID (เช่น #1, #3), #3 ครั้งที่2, Auto, Extra หรือ Wallet 0x..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-[#a9d7ff] bg-[#f8fcff] text-xs sm:text-sm text-[#09265f] focus:outline-none focus:border-[#087cf4]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#5a78a1] hover:text-[#09265f] cursor-pointer"
                aria-label="ล้างคำค้นหา"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <span className="text-[11px] font-bold text-[#52739e] whitespace-nowrap shrink-0 tabular-nums">
            แสดง {fmtNum(filteredItems.length)} รหัส
          </span>
        </div>
      </section>

      {/* 3. EMPTY WALLET / NO MATCH NOTICE OR ID CARDS GRID */}
      {effectiveScope === 'MY_WALLET' && myWalletItems.length === 0 ? (
        <section className="mx-0.5 sm:mx-1 p-6 sm:p-8 rounded-[22px] bg-white/95 border border-[#b8e1ff] shadow-[0_8px_22px_rgba(7,85,181,0.16)] text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#e6f5ff] border border-[#a9d7ff] text-[#0754b9] mx-auto flex items-center justify-center">
            <Wallet className="w-6 h-6" />
          </div>
          <h3 className="text-base font-black text-[#09265f]">
            ยังไม่พบ ID ในกระเป๋า {shortAddr(account || '')}
          </h3>
          <p className="text-xs text-[#54759c] max-w-md mx-auto leading-relaxed">
            กระเป๋านี้ยังไม่ได้สมัครสมาชิกในระบบ Fractal Flow Matrix 18 คุณสามารถสมัคร ID แรก หรือสลับไปดูคลังไอดีทั้งระบบเพื่อตรวจสอบโครงสร้างได้
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
            <button
              type="button"
              onClick={onOpenRegisterModal}
              className="px-4 py-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xs font-black inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <UserPlus className="w-4 h-4" /> สมัครสมาชิก / เพิ่ม ID
            </button>
            <button
              type="button"
              onClick={() => setScope('SYSTEM')}
              className="px-4 py-2 rounded-xl bg-[#edf7ff] border border-[#9fd4ff] text-[#0754b9] text-xs font-bold cursor-pointer"
            >
              ดูคลังไอดีทั้งระบบ ({fmtNum(allItems.length)} รหัส)
            </button>
          </div>
        </section>
      ) : filteredItems.length === 0 ? (
        <section className="mx-0.5 sm:mx-1 p-6 rounded-[22px] bg-white/95 border border-[#b8e1ff] text-center space-y-2">
          <div className="text-sm font-black text-[#09265f]">ไม่พบ ID ที่ตรงกับเงื่อนไขการค้นหา</div>
          <p className="text-xs text-[#54759c]">
            ลองล้างคำค้นหาหรือเปลี่ยนตัวกรองหมวดหมู่ / Rank ดูอีกครั้ง
          </p>
          <button
            type="button"
            onClick={() => {
              setCategoryFilter('ALL');
              setRankFilter('ALL');
              setSearchQuery('');
            }}
            className="px-3.5 py-1.5 rounded-xl bg-[#087cf4] text-white text-xs font-bold cursor-pointer"
          >
            ล้างตัวกรองทั้งหมด
          </button>
        </section>
      ) : (
        <section className="mx-0.5 sm:mx-1 grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
          {filteredItems.map((item) => {
            const active = isItemCurrentlyActive(item);
            const rankPrice = RANK_PRICES_USDT[item.rank - 1] || 5;
            const sideTh =
              item.side === 'RIGHT' ? 'ขวา' : item.side === 'LEFT' ? 'ซ้าย' : '';

            const cardTheme =
              item.category === 'CLONE'
                ? active
                  ? 'bg-gradient-to-br from-[#065f46] to-[#047857] border-[#6ee7b7] text-white'
                  : 'bg-gradient-to-br from-[#f2fcf7] to-[#e0f8ec] border-emerald-300 text-[#064e3b]'
                : item.category === 'EXTRA'
                ? active
                  ? 'bg-gradient-to-br from-[#6d28d9] to-[#4c1d95] border-[#ddd6fe] text-white'
                  : 'bg-gradient-to-br from-[#faf5ff] to-[#ede9fe] border-violet-300 text-[#4c1d95]'
                : item.category === 'AUTO'
                ? active
                  ? 'bg-gradient-to-br from-[#b45309] to-[#78350f] border-[#fde68a] text-white'
                  : 'bg-gradient-to-br from-[#fffbeb] to-[#fef3c7] border-amber-300 text-[#78350f]'
                : active
                ? 'bg-gradient-to-br from-[#075ed0] to-[#032b83] border-[#69eaff] text-white'
                : 'bg-gradient-to-br from-white to-[#e6f5ff] border-[#a9ddff] text-[#09265f]';

            const badgeClass = active
              ? 'bg-[#ffdf6d] text-[#09265f]'
              : item.category === 'CLONE'
              ? 'bg-emerald-600 text-white'
              : item.category === 'EXTRA'
              ? 'bg-violet-600 text-white'
              : item.category === 'AUTO'
              ? 'bg-amber-500 text-slate-950'
              : 'bg-[#087cf4] text-white';

            const subTextClass = active ? 'text-white/85' : 'opacity-80';
            const innerBoxClass = active
              ? 'bg-white/15 border-white/25 text-white'
              : 'bg-white/80 border-black/10 text-[#09265f]';

            return (
              <article
                key={item.uniqueKey}
                className={`p-3 sm:p-4 rounded-[20px] border shadow-[0_6px_18px_rgba(7,85,181,0.14)] space-y-2.5 transition ${cardTheme}`}
              >
                {/* Top Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${badgeClass}`}>
                        {item.badge}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                          active
                            ? 'bg-white/20 text-white'
                            : 'bg-white/90 border border-current/15'
                        }`}
                      >
                        Rank {item.rank} ({fmtNum(rankPrice)} U)
                      </span>
                      {active && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-400 text-slate-950 text-[10px] font-black">
                          ★ กำลังใช้งาน
                        </span>
                      )}
                      {item.isOwnedByConnectedWallet && effectiveScope === 'SYSTEM' && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            active
                              ? 'bg-cyan-300/30 text-white'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          }`}
                        >
                          ของกระเป๋าฉัน
                        </span>
                      )}
                    </div>

                    <h3 className="text-base sm:text-lg font-black mt-1 leading-tight truncate">
                      {item.title}
                    </h3>
                    <p className={`text-[11px] font-semibold truncate ${subTextClass}`}>
                      {item.subtitle}
                    </p>
                  </div>

                  {(item.category === 'MAIN' || item.category === 'AUTO') &&
                    item.isOwnedByConnectedWallet &&
                    item.rank < 18 &&
                    onOpenUpgradeForMainId && (
                      <button
                        type="button"
                        onClick={() => onOpenUpgradeForMainId(item.id)}
                        className="px-2.5 py-1 rounded-xl bg-[#ffdf6d] hover:brightness-105 text-[#09265f] text-[10.5px] font-black inline-flex items-center gap-1 cursor-pointer shrink-0 shadow-xs"
                      >
                        <Crown className="w-3 h-3" />
                        <span>อัปเกรด R{item.rank + 1}</span>
                      </button>
                    )}
                </div>

                {/* Metadata Line */}
                <div className={`text-[10.5px] font-mono flex items-center gap-2 flex-wrap ${subTextClass}`}>
                  <span>ผู้แนะนำ #{item.directSponsorNodeId}</span>
                  {item.parentId > 0 && (
                    <span>
                      · ใต้ #{item.parentId}
                      {sideTh ? ` (${sideTh})` : ''}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCopyWallet(item.owner, item.uniqueKey)}
                    className="inline-flex items-center gap-1 hover:underline cursor-pointer"
                    title={item.owner}
                  >
                    <span>· {shortAddr(item.owner)}</span>
                    <Copy className="w-2.5 h-2.5" />
                    {copiedKey === item.uniqueKey && (
                      <span className="text-[9.5px] font-sans font-bold text-emerald-500">คัดลอกแล้ว</span>
                    )}
                  </button>
                </div>

                {/* Financial Stats */}
                <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                  <div className={`p-2 rounded-xl border ${innerBoxClass}`}>
                    <div className="text-[10px] opacity-75">รายได้รวมของรหัสนี้</div>
                    <strong className="text-sm font-black font-mono text-emerald-500 block">
                      +{item.totalEarnedUsdt.toFixed(2)} U
                    </strong>
                    <div className="text-[9.5px] font-mono opacity-80 truncate">
                      แนะนำ {item.direct30TotalUsdt.toFixed(2)} · ชั้น {item.level30TotalUsdt.toFixed(2)}
                    </div>
                  </div>

                  {item.category === 'MAIN' || item.category === 'AUTO' ? (
                    <div className={`p-2 rounded-xl border ${innerBoxClass}`}>
                      <div className="text-[10px] opacity-75">Vault คงเหลือ (3 ถัง)</div>
                      <strong className="text-sm font-black font-mono block">
                        {item.vaultRemainingUsdt.toFixed(2)} U
                      </strong>
                      <div className="text-[9.5px] font-mono opacity-80 truncate">
                        อัพ {item.upgradeRankPoolUsdt.toFixed(2)} · Auto {item.newAutoIdPoolUsdt.toFixed(2)} · Extra{' '}
                        {item.newExtraIdPoolUsdt.toFixed(2)}
                      </div>
                    </div>
                  ) : (
                    <div className={`p-2 rounded-xl border ${innerBoxClass}`}>
                      <div className="text-[10px] opacity-75">35% Vault ที่ส่งเข้า Main #{item.mainId}</div>
                      <strong className="text-sm font-black font-mono block">
                        {item.vaultGrossUsdt.toFixed(2)} U
                      </strong>
                      <div className="text-[9.5px] font-mono opacity-80 truncate">
                        โหนด #{item.id} · Rank {item.rank}
                      </div>
                    </div>
                  )}
                </div>

                {/* Sub-IDs Spawned by Main/Auto */}
                {(item.category === 'MAIN' || item.category === 'AUTO') &&
                  (item.subAutoCount > 0 || item.subExtraCount > 0 || item.subCloneCount > 0) && (
                    <div className={`text-[10.5px] font-bold flex items-center gap-2 flex-wrap ${subTextClass}`}>
                      <Sparkles className="w-3 h-3 shrink-0" />
                      <span>สร้างรหัสย่อยแล้ว:</span>
                      <span>Auto {item.subAutoCount}</span>
                      <span>· Extra {item.subExtraCount}</span>
                      <span>· โคลน {item.subCloneCount}</span>
                    </div>
                  )}

                {/* Actions */}
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (item.category === 'CLONE' || item.category === 'EXTRA') {
                        onSelectSubId({
                          kind: item.category,
                          rank: item.rank,
                          nodeId: item.id,
                          mainId: item.mainId,
                        });
                      } else {
                        onSelectMainId(item.id);
                      }
                    }}
                    className={`px-2 py-1.5 rounded-xl text-[10.5px] font-black inline-flex items-center justify-center gap-1 cursor-pointer transition ${
                      active
                        ? 'bg-white text-[#0754b9]'
                        : 'bg-[#087cf4] hover:bg-[#0568d0] text-white'
                    }`}
                  >
                    <ArrowUpRight className="w-3 h-3 shrink-0" />
                    <span className="truncate">เปิดหน้าหลัก</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (item.category === 'CLONE' || item.category === 'EXTRA') {
                        onOpenMatrixForNode(item.rank, item.id, {
                          kind: item.category,
                          rank: item.rank,
                          nodeId: item.id,
                          mainId: item.mainId,
                        });
                      } else {
                        onOpenMatrixForNode(1, item.id, null);
                      }
                    }}
                    className={`px-2 py-1.5 rounded-xl text-[10.5px] font-bold inline-flex items-center justify-center gap-1 cursor-pointer border transition ${
                      active
                        ? 'bg-white/15 hover:bg-white/25 border-white/30 text-white'
                        : 'bg-white/90 hover:bg-white border-current/20'
                    }`}
                  >
                    <GitBranch className="w-3 h-3 shrink-0" />
                    <span className="truncate">ผัง Matrix</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (item.category === 'CLONE' || item.category === 'EXTRA') {
                        onOpenUnilevelForNode(item.id, item.mainId, {
                          kind: item.category,
                          rank: item.rank,
                          nodeId: item.id,
                          mainId: item.mainId,
                        });
                      } else {
                        onOpenUnilevelForNode(item.id, item.id, null);
                      }
                    }}
                    className={`px-2 py-1.5 rounded-xl text-[10.5px] font-bold inline-flex items-center justify-center gap-1 cursor-pointer border transition ${
                      active
                        ? 'bg-white/15 hover:bg-white/25 border-white/30 text-white'
                        : 'bg-white/90 hover:bg-white border-current/20'
                    }`}
                  >
                    <Layers className="w-3 h-3 shrink-0" />
                    <span className="truncate">ยูนิ 15 ชั้น</span>
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
};

export default Dashboard2IdVaultPanel;
