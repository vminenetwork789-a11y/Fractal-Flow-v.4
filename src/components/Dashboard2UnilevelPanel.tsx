import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  RefreshCw,
  Search,
  ArrowLeft,
  X,
  Users,
  Coins,
} from 'lucide-react';
import { FractalFlowBrandCard } from './FractalFlowLogo';
import { WalletIncomeNotifier } from './WalletIncomeNotifier';
import { RANK_PRICES_USDT } from '../contracts/config';
import type { MatrixActiveIdSummary, MatrixTreeNodeRaw } from './Dashboard2MatrixPanel';

async function safeReadJson(res: Response | null): Promise<any> {
  if (!res || !res.ok) return null;
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

interface UnilevelLayerEntry {
  node: MatrixTreeNodeRaw;
  layer: number;
  parentId: number;
  side: 'ROOT' | 'LEFT' | 'RIGHT';
  path: string[];
  subtreeCount: number;
}

interface Dashboard2UnilevelPanelProps {
  displayId: number;
  currentRank: number;
  initialRootId?: number | null;
  focusVersion?: number;
  rankCounts?: Record<number, number>;
  contractAddress: string;
  refreshTrigger?: any;
  activeIdSummary?: MatrixActiveIdSummary | null;
  allReports?: any[];
  onBackToHome: () => void;
  onOpenMatrixForId: (mainId: number, targetRank?: number) => void;
  onSelectMainId: (idStr: string) => void;
  onOpenSwitchId?: () => void;
  account?: string | null;
  language?: 'th' | 'en';
  theme?: 'light' | 'dark';
  onRefreshNotifications?: () => void;
}

const fmtNum = (n: number): string => n.toLocaleString('en-US');

const shortAddr = (addr?: string): string => {
  if (!addr || addr === '0x0000000000000000000000000000000000000000') return '—';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

const isAutoNode = (node?: MatrixTreeNodeRaw | null): boolean => {
  if (!node) return false;
  const ot = String(node.originType || '').toUpperCase();
  const cot = String(node.confirmedOriginType || '').toUpperCase();
  return ot === 'AUTO_ID' || ot === 'AUTO_NEW_MAIN' || cot === 'AUTO_ID' || cot === 'AUTO_NEW_MAIN';
};

const isExtraNode = (node?: MatrixTreeNodeRaw | null): boolean => {
  if (!node) return false;
  const ot = String(node.originType || '').toUpperCase();
  const cot = String(node.confirmedOriginType || '').toUpperCase();
  return Boolean(node.isExtraId) || ot === 'AUTO_EXTRA' || cot === 'AUTO_EXTRA';
};

const isCloneNode = (node?: MatrixTreeNodeRaw | null): boolean => {
  if (!node) return false;
  return Boolean(node.isClone) || String(node.originType || '').toUpperCase() === 'CLONE';
};

const getMainId = (node?: MatrixTreeNodeRaw | null, fallbackId?: number): number => {
  if (!node) return Number(fallbackId || 0);
  const orig = Number(node.originMainId || 0);
  return orig > 0 ? orig : Number(node.id || fallbackId || 0);
};

const getShortTypeTag = (node?: MatrixTreeNodeRaw | null): string => {
  if (!node) return 'MAIN';
  if (isExtraNode(node)) return 'EXTRA';
  if (isCloneNode(node)) return 'CLONE';
  if (isAutoNode(node)) return 'AUTO';
  return 'MAIN';
};

const getDisplayStatusText = (node?: MatrixTreeNodeRaw | null, cloneSeq = 0): string => {
  if (!node) return 'Main ID';
  if (isExtraNode(node)) return 'Extra ID';
  if (isCloneNode(node)) {
    return cloneSeq > 0 ? `โคลนนิ่ง · ครั้งที่ ${cloneSeq}` : 'โคลนนิ่ง';
  }
  if (isAutoNode(node)) return 'Auto ID';
  return 'Main ID';
};

export const Dashboard2UnilevelPanel: React.FC<Dashboard2UnilevelPanelProps> = ({
  displayId,
  currentRank,
  initialRootId,
  focusVersion = 0,
  rankCounts = {},
  contractAddress,
  refreshTrigger,
  activeIdSummary,
  allReports = [],
  onBackToHome,
  onOpenMatrixForId,
  onOpenSwitchId,
  account = null,
  language = 'th',
  theme = 'light',
  onRefreshNotifications,
}) => {
  const [unilevelRank, setUnilevelRank] = useState<number>(1);
  const [rankNodes, setRankNodes] = useState<MatrixTreeNodeRaw[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');

  const [focusedRootId, setFocusedRootId] = useState<number | null>(
    initialRootId ? Number(initialRootId) : null
  );
  const [selectedLayer, setSelectedLayer] = useState<number>(0);

  const [searchInput, setSearchInput] = useState<string>('');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState<boolean>(false);
  const [searchResult, setSearchResult] = useState<{
    query: string;
    message: string;
    isError?: boolean;
    hits: Array<{
      node: MatrixTreeNodeRaw;
      mainId: number;
      cloneSeq: number;
      layerFromRoot: number | null;
      sideFromParent: 'ROOT' | 'LEFT' | 'RIGHT';
      pathFromGlobal: string[];
    }>;
  } | null>(null);

  const [layerPopupModal, setLayerPopupModal] = useState<number | 'all' | null>(null);
  const [incomeSourceModalLayer, setIncomeSourceModalLayer] = useState<number | null>(null);
  const [popupTypeFilter, setPopupTypeFilter] = useState<'ALL' | 'MAIN' | 'AUTO' | 'CLONE' | 'EXTRA'>('ALL');
  const [popupSearch, setPopupSearch] = useState<string>('');

  useEffect(() => {
    setFocusedRootId(initialRootId ? Number(initialRootId) : null);
    setSelectedLayer(0);
    setSearchResult(null);
  }, [displayId, initialRootId, focusVersion]);

  const fetchRankNodes = useCallback(
    async (opts?: { silent?: boolean } | unknown) => {
      const silent = Boolean(
        opts && typeof opts === 'object' && 'silent' in opts && (opts as { silent?: boolean }).silent
      );
      if (!silent) setLoading(true);
      setLoadError('');
      try {
        const qs = new URLSearchParams({ rank: String(unilevelRank) });
        if (contractAddress) qs.set('contract', contractAddress);
        const res = await fetch(`/api/matrix/tree-nodes?${qs.toString()}`, {
          headers: { Accept: 'application/json' },
        });
        const json = await safeReadJson(res);
        if (!res.ok || !json?.success) {
          throw new Error(json?.error || 'ไม่สามารถโหลดข้อมูลผังยูนิ 15 ชั้นได้');
        }
        const fetched = Array.isArray(json.nodes) ? (json.nodes as MatrixTreeNodeRaw[]) : [];
        setRankNodes(fetched);
      } catch (err: any) {
        if (!silent) {
          setLoadError(err?.message || 'เกิดข้อผิดพลาดในการโหลดข้อมูลผังยูนิ 15 ชั้น');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [contractAddress, unilevelRank]
  );

  useEffect(() => {
    fetchRankNodes();
    const onRefresh = () => fetchRankNodes({ silent: true });
    window.addEventListener('matrix:tree:refresh', onRefresh);
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchRankNodes({ silent: true });
    }, 30000);
    return () => {
      window.removeEventListener('matrix:tree:refresh', onRefresh);
      clearInterval(interval);
    };
  }, [fetchRankNodes, refreshTrigger]);

  // Index 1-to-2 nodes for the currently selected Rank
  const { nodeMap, cloneSeqByNodeId, subtreeCountMap } = useMemo(() => {
    const m = new Map<number, MatrixTreeNodeRaw>();
    const clonesByMain = new Map<number, number[]>();
    const sorted = [...rankNodes].sort((a, b) => Number(a.id) - Number(b.id));
    for (const n of sorted) {
      m.set(Number(n.id), n);
      if (isCloneNode(n)) {
        const mainId = getMainId(n);
        const list = clonesByMain.get(mainId) || [];
        list.push(Number(n.id));
        clonesByMain.set(mainId, list);
      }
    }
    const seqMap = new Map<number, number>();
    for (const n of sorted) {
      if (isCloneNode(n)) {
        const mainId = getMainId(n);
        const list = clonesByMain.get(mainId) || [];
        seqMap.set(Number(n.id), list.indexOf(Number(n.id)) + 1);
      }
    }

    const subMap = new Map<number, number>();
    const computeSub = (nid: number): number => {
      if (subMap.has(nid)) return subMap.get(nid)!;
      const visited = new Set<number>([nid]);
      const q: Array<{ id: number; depth: number }> = [{ id: nid, depth: 0 }];
      let cnt = 0;
      while (q.length > 0) {
        const cur = q.shift()!;
        if (cur.depth >= 15) continue;
        const nObj = m.get(cur.id);
        if (!nObj) continue;
        for (const cid of [Number(nObj.leftChild || 0), Number(nObj.rightChild || 0)]) {
          if (cid > 0 && !visited.has(cid) && m.has(cid)) {
            visited.add(cid);
            cnt++;
            q.push({ id: cid, depth: cur.depth + 1 });
          }
        }
      }
      subMap.set(nid, cnt);
      return cnt;
    };
    for (const n of sorted) computeSub(Number(n.id));

    return {
      nodeMap: m,
      cloneSeqByNodeId: seqMap,
      subtreeCountMap: subMap,
    };
  }, [rankNodes]);

  const idEffectiveRank = useMemo(() => {
    if (activeIdSummary?.isSubId && activeIdSummary.subRank) {
      return activeIdSummary.subRank;
    }
    return Math.max(1, Math.min(18, Number(activeIdSummary?.currentRank || currentRank || 1)));
  }, [activeIdSummary, currentRank]);

  const activeIdNodeInCurrentRank = useMemo(() => {
    const baseMain = Number(activeIdSummary?.mainId || displayId || 1);
    if (activeIdSummary?.isSubId && activeIdSummary.subRank && activeIdSummary.subNodeId) {
      if (unilevelRank !== activeIdSummary.subRank) return null;
      return nodeMap.get(Number(activeIdSummary.subNodeId)) || null;
    }
    if (unilevelRank === 1) {
      const r1Node = nodeMap.get(baseMain);
      if (r1Node && !isCloneNode(r1Node) && !isExtraNode(r1Node)) return r1Node;
      return null;
    }
    const byOrigin = rankNodes.find(
      (n) => Number(n.originMainId) === baseMain && !isCloneNode(n) && !isExtraNode(n)
    );
    if (byOrigin) return byOrigin;
    const fallback = nodeMap.get(baseMain);
    if (
      fallback &&
      !isCloneNode(fallback) &&
      !isExtraNode(fallback) &&
      (Number(fallback.originMainId || 0) === 0 || Number(fallback.originMainId) === baseMain)
    ) {
      return fallback;
    }
    return null;
  }, [activeIdSummary, unilevelRank, nodeMap, rankNodes, displayId]);

  const isIdUnlockedInRank = useCallback(
    (r: number) => {
      if (activeIdSummary?.isSubId && activeIdSummary.subRank) {
        return r === activeIdSummary.subRank;
      }
      if (r <= idEffectiveRank) return true;
      if (r === unilevelRank && activeIdNodeInCurrentRank) return true;
      return false;
    },
    [activeIdSummary, idEffectiveRank, unilevelRank, activeIdNodeInCurrentRank]
  );

  const isSelectedRankUnlockedForId = isIdUnlockedInRank(unilevelRank);

  const defaultRootId = useMemo(() => {
    if (activeIdNodeInCurrentRank) return Number(activeIdNodeInCurrentRank.id);
    if (nodeMap.has(1)) return 1;
    return rankNodes.length > 0 ? Number(rankNodes[0].id) : Number(activeIdSummary?.mainId || displayId || 1);
  }, [activeIdNodeInCurrentRank, nodeMap, rankNodes, activeIdSummary?.mainId, displayId]);

  const effectiveRootId = useMemo(() => {
    if (focusedRootId && nodeMap.has(focusedRootId)) return focusedRootId;
    return defaultRootId;
  }, [focusedRootId, nodeMap, defaultRootId]);

  const rootNode = nodeMap.get(effectiveRootId) || null;
  const rootCanonicalMainId = getMainId(rootNode, effectiveRootId);

  // Build strict 1-to-2 Binary Layers (0..15) starting from effectiveRootId
  const { layersMap, subtreeDepthMap, totalSubtreeCount } = useMemo(() => {
    const layers: Record<number, UnilevelLayerEntry[]> = {};
    for (let l = 0; l <= 15; l++) layers[l] = [];
    const subDepth = new Map<number, UnilevelLayerEntry>();
    const globDepth = new Map<number, number>();
    let subTotal = 0;

    if (rootNode) {
      const visited = new Set<number>([Number(rootNode.id)]);
      const rootEntry: UnilevelLayerEntry = {
        node: rootNode,
        layer: 0,
        parentId: Number(rootNode.parentId || 0),
        side: 'ROOT',
        path: ['ROOT'],
        subtreeCount: subtreeCountMap.get(Number(rootNode.id)) || 0,
      };
      layers[0] = [rootEntry];
      subDepth.set(Number(rootNode.id), rootEntry);
      subTotal = 1;

      for (let l = 0; l < 15; l++) {
        const current = layers[l];
        if (!current || current.length === 0) break;
        const next: UnilevelLayerEntry[] = [];
        for (const entry of current) {
          const leftId = Number(entry.node.leftChild || 0);
          if (leftId > 0 && !visited.has(leftId) && nodeMap.has(leftId)) {
            visited.add(leftId);
            const leftNode = nodeMap.get(leftId)!;
            const childEntry: UnilevelLayerEntry = {
              node: leftNode,
              layer: l + 1,
              parentId: Number(entry.node.id),
              side: 'LEFT',
              path: [...entry.path, `ซ้าย(#${leftId})`],
              subtreeCount: subtreeCountMap.get(leftId) || 0,
            };
            next.push(childEntry);
            subDepth.set(leftId, childEntry);
            subTotal += 1;
          }
          const rightId = Number(entry.node.rightChild || 0);
          if (rightId > 0 && !visited.has(rightId) && nodeMap.has(rightId)) {
            visited.add(rightId);
            const rightNode = nodeMap.get(rightId)!;
            const childEntry: UnilevelLayerEntry = {
              node: rightNode,
              layer: l + 1,
              parentId: Number(entry.node.id),
              side: 'RIGHT',
              path: [...entry.path, `ขวา(#${rightId})`],
              subtreeCount: subtreeCountMap.get(rightId) || 0,
            };
            next.push(childEntry);
            subDepth.set(rightId, childEntry);
            subTotal += 1;
          }
        }
        layers[l + 1] = next;
      }
    }

    return {
      layersMap: layers,
      subtreeDepthMap: subDepth,
      totalSubtreeCount: subTotal,
    };
  }, [rootNode, nodeMap, subtreeCountMap]);

  // Rank-specific Direct 30% & Level 2% totals from allReports
  const rankIncomeSummary = useMemo(() => {
    const rootReport = allReports.find(
      (r) => r && !r.isClone && !r.isExtraId && Number(r.id || 0) === rootCanonicalMainId
    );
    const directItems = (Array.isArray(rootReport?.direct30History) ? rootReport.direct30History : []).filter(
      (h: any) => Number(h?.rank || 1) === unilevelRank
    );
    const levelItems = (Array.isArray(rootReport?.level30History) ? rootReport.level30History : []).filter(
      (h: any) => Number(h?.rank || 1) === unilevelRank
    );

    const directTotal = Number(
      directItems.reduce((s: number, h: any) => s + Number(h?.amountUsdt || 0), 0).toFixed(2)
    );
    const levelTotalAllOwnNodes = Number(
      levelItems.reduce((s: number, h: any) => s + Number(h?.amountUsdt || 0), 0).toFixed(2)
    );
    const levelTotalForFocusedNode = Number(
      levelItems
        .filter((h: any) => Number(h?.toNodeId || 0) === 0 || Number(h?.toNodeId) === effectiveRootId)
        .reduce((s: number, h: any) => s + Number(h?.amountUsdt || 0), 0)
        .toFixed(2)
    );

    return {
      rootReport,
      directItems,
      levelItems,
      directTotal,
      levelTotalAllOwnNodes,
      levelTotalForFocusedNode,
    };
  }, [allReports, rootCanonicalMainId, unilevelRank, effectiveRootId]);

  const focusAsRoot = useCallback(
    (nodeId: number) => {
      if (!nodeMap.has(nodeId)) return;
      setFocusedRootId(nodeId);
      setSelectedLayer(0);
    },
    [nodeMap]
  );

  const runUnilevelSearch = useCallback(
    (overrideQuery?: string) => {
      const raw = (overrideQuery !== undefined ? overrideQuery : searchInput).trim();
      if (!raw) {
        setSearchResult(null);
        return;
      }

      const layerMatch = raw.match(/^(?:ชั้น|layer|gen)\s*[:#-]?\s*(\d{1,2})$/i);
      if (layerMatch) {
        const lNum = Math.max(0, Math.min(15, Number(layerMatch[1])));
        setSelectedLayer(lNum);
        const entries = layersMap[lNum] || [];
        setSearchResult({
          query: raw,
          message: `แสดงชั้นที่ ${lNum} ในผัง 1 แตก 2 ของ #${effectiveRootId} (พบ ${entries.length} รหัส)`,
          hits: entries.slice(0, 35).map((e) => ({
            node: e.node,
            mainId: getMainId(e.node),
            cloneSeq: isCloneNode(e.node) ? cloneSeqByNodeId.get(Number(e.node.id)) || 0 : 0,
            layerFromRoot: e.layer,
            sideFromParent: e.side,
            pathFromGlobal: e.path,
          })),
        });
        return;
      }

      const buildGlobalPath = (targetId: number): string[] => {
        const p: string[] = [];
        const seen = new Set<number>();
        let cur = targetId;
        for (let s = 0; s < 30; s++) {
          if (cur <= 0 || seen.has(cur)) break;
          seen.add(cur);
          const n = nodeMap.get(cur);
          if (!n) break;
          const mid = getMainId(n);
          const parentNode = Number(n.parentId || 0) > 0 ? nodeMap.get(Number(n.parentId)) : undefined;
          const sideLabel = !parentNode
            ? ''
            : Number(parentNode.leftChild) === cur
            ? 'ซ้าย '
            : Number(parentNode.rightChild) === cur
            ? 'ขวา '
            : '';
          p.unshift(`${sideLabel}#${mid}${isCloneNode(n) ? '(โคลน)' : ''}`);
          cur = Number(n.parentId || 0);
        }
        return p;
      };

      const cloneRoundMatch = raw.match(
        /^(?:id\s*#?|#)?(\d+)\s*(?:โคลน(?:นิ่ง)?\s*)?(?:ครั้ง(?:ที่)?|รอบ)\s*[:#-]?\s*(\d+)$/i
      );
      const idMatch = raw.match(/^(?:id\s*#?|#)?(\d+)$/i);
      const q = raw.toLowerCase();

      const matched: MatrixTreeNodeRaw[] = [];
      for (const n of rankNodes) {
        const mId = getMainId(n);
        const cloneSeq = isCloneNode(n) ? cloneSeqByNodeId.get(Number(n.id)) || 0 : 0;

        if (cloneRoundMatch) {
          const targetId = Number(cloneRoundMatch[1]);
          const targetRound = Number(cloneRoundMatch[2]);
          if (isCloneNode(n) && mId === targetId && cloneSeq === targetRound) {
            matched.push(n);
          }
        } else if (idMatch) {
          const targetId = Number(idMatch[1]);
          if (Number(n.id) === targetId || mId === targetId) {
            matched.push(n);
          }
        } else {
          const hay = [
            `#${mId}`,
            `#${n.id}`,
            n.owner,
            getDisplayStatusText(n, cloneSeq),
            isCloneNode(n) ? `โคลน clone ครั้งที่ ${cloneSeq}` : '',
            isAutoNode(n) ? 'auto' : '',
            isExtraNode(n) ? 'extra' : '',
          ]
            .join(' ')
            .toLowerCase();
          if (hay.includes(q)) matched.push(n);
        }
      }

      matched.sort((a, b) => {
        const aIn = subtreeDepthMap.has(Number(a.id)) ? 0 : 1;
        const bIn = subtreeDepthMap.has(Number(b.id)) ? 0 : 1;
        if (aIn !== bIn) return aIn - bIn;
        return Number(a.id) - Number(b.id);
      });

      if (matched.length === 0) {
        setSearchResult({
          query: raw,
          message: `ไม่พบสมาชิกหรือตำแหน่งที่ตรงกับ "${raw}" ใน Rank ${unilevelRank}`,
          isError: true,
          hits: [],
        });
        return;
      }

      setSearchResult({
        query: raw,
        message: `พบ ${matched.length} ตำแหน่งที่ตรงกับ "${raw}" (Rank ${unilevelRank})`,
        hits: matched.slice(0, 35).map((n) => {
          const subEntry = subtreeDepthMap.get(Number(n.id));
          return {
            node: n,
            mainId: getMainId(n),
            cloneSeq: isCloneNode(n) ? cloneSeqByNodeId.get(Number(n.id)) || 0 : 0,
            layerFromRoot: subEntry ? subEntry.layer : null,
            sideFromParent: subEntry ? subEntry.side : 'ROOT',
            pathFromGlobal: buildGlobalPath(Number(n.id)),
          };
        }),
      });
    },
    [searchInput, layersMap, effectiveRootId, cloneSeqByNodeId, nodeMap, rankNodes, subtreeDepthMap, unilevelRank]
  );

  const layer1Entries = layersMap[1] || [];

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
              ผัง ยูนิ 15 ชั้น (1 แตก 2) · Rank {unilevelRank}
            </span>
            <span className="px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-white/15 border border-[#9eeaff] text-[11px] sm:text-xs font-bold max-w-full break-words sm:whitespace-nowrap tabular-nums">
              👤 #{rootCanonicalMainId} (โหนด #{effectiveRootId} · R{unilevelRank})
              {!isSelectedRankUnlockedForId && ` · 🔒 ยังไม่ปลดล็อก R${unilevelRank}`}
            </span>
            {onOpenSwitchId && (
              <button
                type="button"
                onClick={onOpenSwitchId}
                className="px-2.5 py-1.5 rounded-xl bg-gradient-to-br from-[#23caff] to-[#0755d7] hover:brightness-110 border border-[#7ce5ff]/70 text-white text-[11px] font-black inline-flex items-center gap-1 whitespace-nowrap cursor-pointer shadow-sm"
              >
                ⇄ สลับไอดี
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsSearchModalOpen(true)}
              className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-cyan-200/60 text-white text-[11px] font-black inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" /> ค้นหา ID
            </button>
            <WalletIncomeNotifier
              account={account}
              language={language}
              theme={theme}
              onRefresh={onRefreshNotifications || fetchRankNodes}
            />
            <button
              type="button"
              onClick={() => fetchRankNodes()}
              className="p-2 rounded-xl bg-white/15 hover:bg-white/25 border border-cyan-300/40 text-white cursor-pointer"
              title="รีเฟรชข้อมูลผังยูนิ 15 ชั้น"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => onOpenMatrixForId(rootCanonicalMainId, unilevelRank)}
              className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-cyan-300/40 text-[11px] font-bold text-white inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              ⌘ ดูผัง Matrix (R{unilevelRank})
            </button>
            {effectiveRootId !== defaultRootId && (
              <button
                type="button"
                onClick={() => focusAsRoot(defaultRootId)}
                className="px-2.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 border border-cyan-200/60 text-white text-[11px] font-bold whitespace-nowrap cursor-pointer"
              >
                ↺ กลับ #{getMainId(nodeMap.get(defaultRootId), defaultRootId)}
              </button>
            )}
            <button
              type="button"
              onClick={onBackToHome}
              className="px-2.5 py-1.5 rounded-xl bg-white text-[#0754b9] text-[11px] font-black inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <ArrowLeft className="w-3 h-3" /> กลับหน้าหลัก
            </button>
          </div>
        </div>

        {/* RANK 1–18 SWITCHER */}
        <div className="mt-3 pt-3 border-t border-white/15 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap text-[10.5px] text-cyan-100 mb-1.5">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="font-bold">เลือกดูข้อมูล 1 แตก 2 ของ Rank:</span>
              <span className="text-[10px] text-cyan-200/90">
                ★ Rank ปัจจุบัน (R{idEffectiveRank}) · ✓ ปลดล็อกแล้ว · 🔒 ยังไม่ถึง
              </span>
            </div>
            <span className="font-mono">
              R{unilevelRank} ({fmtNum(RANK_PRICES_USDT[unilevelRank - 1] || 5)} U) · ทั้งระบบ{' '}
              {fmtNum(rankNodes.length)} รหัส
            </span>
          </div>
          <div className="flex items-center gap-1.5 w-full max-w-full min-w-0 matrix-horizontal-scroll-only pb-1">
            {Array.from({ length: 18 }, (_, i) => i + 1).map((r) => {
              const active = unilevelRank === r;
              const unlocked = isIdUnlockedInRank(r);
              const isCurrentOfId = r === idEffectiveRank;
              const sysCnt = Number(rankCounts[r] ?? (r === unilevelRank ? rankNodes.length : 0));

              return (
                <button
                  key={`u-rank-${r}`}
                  type="button"
                  onClick={() => {
                    setUnilevelRank(r);
                    setFocusedRootId(null);
                    setSelectedLayer(0);
                    setSearchResult(null);
                  }}
                  title={`ดูข้อมูล 1 แตก 2 ของ Rank ${r} (${fmtNum(RANK_PRICES_USDT[r - 1] || 5)} USDT)`}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition whitespace-nowrap cursor-pointer inline-flex items-center gap-1 shrink-0 ${
                    active
                      ? 'bg-[#ffdf6d] text-[#09265f] shadow-md scale-[1.03]'
                      : unlocked
                      ? 'bg-white/20 text-white hover:bg-white/30 border border-cyan-200/50'
                      : 'bg-white/5 text-cyan-200/70 hover:bg-white/15 border border-white/15'
                  }`}
                >
                  <span className="text-[10px] leading-none">
                    {isCurrentOfId ? '★' : unlocked ? '✓' : '🔒'}
                  </span>
                  <span>R{r}</span>
                  {sysCnt > 0 && (
                    <span className={`text-[9.5px] font-mono ${active ? 'opacity-80' : 'opacity-70'}`}>
                      ({sysCnt})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Summary KPI Cards (Strict Rank & 1-to-2) */}
        <div className="mt-3 pt-3 border-t border-white/15 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs tabular-nums">
          <div className="p-2.5 rounded-xl bg-white/10 border border-white/15">
            <div className="text-[10px] text-cyan-100/90">ชั้น 1 (ซ้าย / ขวา · R{unilevelRank})</div>
            <div className="text-base sm:text-lg font-black text-[#ffdf6d] font-mono">
              {layer1Entries.length}{' '}
              <span className="text-xs font-bold text-white/80">/ 2 ตำแหน่ง</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-white/10 border border-white/15">
            <div className="text-[10px] text-cyan-100/90">ทีม 1 แตก 2 (R{unilevelRank} · 15 ชั้น)</div>
            <div className="text-base sm:text-lg font-black text-white font-mono">
              {fmtNum(totalSubtreeCount)}{' '}
              <span className="text-[11px] font-bold text-cyan-100/80">รหัส</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-white/10 border border-white/15">
            <div className="text-[10px] text-cyan-100/90">แนะนำตรง 30% (R{unilevelRank})</div>
            <div className="text-base sm:text-lg font-black text-emerald-300 font-mono">
              +{rankIncomeSummary.directTotal.toFixed(2)} U
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-white/10 border border-white/15">
            <div className="text-[10px] text-cyan-100/90">ค่าชั้น 2% ฝั่งซ้าย (R{unilevelRank})</div>
            <div className="text-base sm:text-lg font-black text-cyan-200 font-mono">
              +{rankIncomeSummary.levelTotalForFocusedNode.toFixed(2)} U
            </div>
            {rankIncomeSummary.levelTotalAllOwnNodes > rankIncomeSummary.levelTotalForFocusedNode && (
              <div className="text-[9.5px] text-cyan-100/85 truncate">
                รวมโคลนทั้งหมด +{rankIncomeSummary.levelTotalAllOwnNodes.toFixed(2)} U
              </div>
            )}
          </div>
        </div>
      </section>

      {loadError && (
        <div className="mx-0.5 sm:mx-1 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
          {loadError}
        </div>
      )}

      {/* 2. SEARCH TRIGGER BAR */}
      <section className="mx-0.5 sm:mx-1 p-3 sm:p-3.5 rounded-[20px] bg-white/95 border border-[#b8e1ff] shadow-[0_6px_18px_rgba(7,85,181,0.14)] min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-[#e6f5ff] border border-[#b5ddff] text-[#087cf4] flex items-center justify-center shrink-0">
              <Search className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[13.5px] sm:text-[15px] font-black text-[#09275f] leading-tight">
                ค้นหาในผังยูนิ 15 ชั้น (1 แตก 2)
              </h3>
              <p className="text-[10.5px] font-semibold text-[#5a78a1] truncate">
                พิมพ์ #ID (เช่น #3 หรือ #3 ครั้งที่2), ชั้น (เช่น ชั้น2) หรือ Wallet 0x...
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsSearchModalOpen(true)}
            className="w-full sm:w-auto px-4 py-2 rounded-[13px] text-white text-xs sm:text-[13px] font-bold bg-gradient-to-r from-[#22caff] to-[#0758d4] shadow-[0_4px_12px_rgba(8,124,244,0.35)] hover:brightness-105 cursor-pointer inline-flex items-center justify-center gap-1.5 shrink-0"
          >
            <Search className="w-3.5 h-3.5" />
            <span>
              {searchResult?.query ? `เปิดผลค้นหา "${searchResult.query}"` : 'เปิดหน้าต่างค้นหา'}
            </span>
          </button>
        </div>
      </section>


      {/* 4. 15-LAYER SUMMARY TABLE (100% MATCHING MATRIX "สรุปโครงสร้างแต่ละชั้น" FOR SELECTED RANK) */}
      <section className="mx-0.5 sm:mx-1 p-2.5 sm:p-4 rounded-[21px] bg-white/90 border border-[#b8e1ff] shadow-[0_8px_22px_rgba(7,85,181,0.17)] min-w-0">
        {(() => {
          const rankUnitPrice = RANK_PRICES_USDT[unilevelRank - 1] || 5;
          const levelRateUsdt = Number((rankUnitPrice * 0.02).toFixed(2));

          return (
            <>
              <div className="flex items-center justify-between gap-2 mb-2.5 sm:mb-3 flex-wrap px-0.5">
                <div className="min-w-0">
                  <h3 className="text-[14.5px] sm:text-[16px] font-black text-[#09275f]">
                    📋 สรุปโครงสร้างแต่ละชั้น
                  </h3>
                  <small className="text-[10.5px] font-semibold text-[#5a78a1]">
                    ความจุตามทฤษฎี & สมาชิกจริง · Rank {unilevelRank} ({fmtNum(rankUnitPrice)} U)
                  </small>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPopupTypeFilter('ALL');
                    setPopupSearch('');
                    setLayerPopupModal('all');
                  }}
                  className="px-2.5 sm:px-3 py-1.5 rounded-full bg-gradient-to-r from-[#22caff] to-[#0758d4] text-white text-[10.5px] sm:text-[11px] font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer hover:brightness-105 transition"
                >
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span>ดูสมาชิกจริงทั้งหมด ({fmtNum(totalSubtreeCount)} รหัส)</span>
                </button>
              </div>

              <div className="w-full overflow-x-clip">
                <table className="w-full table-fixed sm:table-auto border-separate border-spacing-x-0 border-spacing-y-1.5 text-[10.5px] sm:text-xs">
                  <colgroup>
                    <col className="w-[19%] sm:w-auto" />
                    <col className="w-[17%] sm:w-auto" />
                    <col className="w-[27%] sm:w-auto" />
                    <col className="w-[37%] sm:w-auto" />
                  </colgroup>
                  <thead>
                    <tr className="text-left text-[#54749b] align-bottom">
                      <th className="px-1.5 py-1.5 sm:px-2 text-[10px] sm:text-xs font-extrabold">
                        ชั้น
                      </th>
                      <th className="px-1 py-1.5 sm:px-2 text-[10px] sm:text-xs font-extrabold text-center sm:text-left leading-tight">
                        จำนวนไอดี
                      </th>
                      <th className="px-1.5 py-1.5 sm:px-2 text-[10px] sm:text-xs font-extrabold leading-tight">
                        รายได้ค่าชั้นฝั่งซ้าย
                      </th>
                      <th className="px-1.5 py-1.5 sm:px-2 text-[10px] sm:text-xs font-extrabold leading-tight">
                        ข้อมูลสมาชิกจริง (ใต้ #{rootCanonicalMainId})
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 16 }, (_, idx) => idx).map((n) => {
                      const realEntries = layersMap[n] || [];
                      const theoreticalSlots = 2 ** n;
                      const leftPayingCount = realEntries.filter((e) => e.side === 'LEFT').length;
                      const earnedTierUsdt = Number((leftPayingCount * levelRateUsdt).toFixed(2));
                      const maxTierUsdt =
                        n >= 1 ? Number((2 ** (n - 1) * levelRateUsdt).toFixed(2)) : 0;

                      const previewIds = realEntries
                        .slice(0, 3)
                        .map((e) => `#${getMainId(e.node)}${isCloneNode(e.node) ? '(โคลน)' : ''}`)
                        .join(', ');
                      const extraMore = realEntries.length > 3 ? ` +${realEntries.length - 3}` : '';
                      const isRowSelected = selectedLayer === n;

                      return (
                        <tr
                          key={`u-layer-row-${n}`}
                          onClick={() => setSelectedLayer(n)}
                          className={`cursor-pointer transition ${
                            isRowSelected ? 'ring-2 ring-[#087cf4] rounded-[10px]' : ''
                          }`}
                        >
                          <td
                            className={`px-1.5 py-2 sm:px-2.5 sm:py-2.5 rounded-l-[10px] font-bold text-[10px] sm:text-xs whitespace-nowrap align-middle ${
                              isRowSelected
                                ? 'bg-[#087cf4] text-white'
                                : 'bg-[#edf7ff] text-[#0757b8]'
                            }`}
                          >
                            {n === 0 ? 'ชั้นเริ่มต้น' : `ชั้น ${n}`}
                          </td>
                          <td
                            className={`px-1 py-2 sm:px-2.5 sm:py-2.5 font-mono tabular-nums text-[9.5px] sm:text-xs text-center sm:text-left whitespace-nowrap align-middle ${
                              isRowSelected ? 'bg-[#dff2ff]' : 'bg-[#edf7ff]'
                            }`}
                          >
                            {fmtNum(theoreticalSlots)}
                          </td>
                          <td
                            className={`px-1 py-1.5 sm:px-2.5 sm:py-2.5 font-mono tabular-nums align-middle ${
                              isRowSelected ? 'bg-[#dff2ff]' : 'bg-[#edf7ff]'
                            }`}
                          >
                            {n === 0 ? (
                              <span className="text-[#6d8aad] px-1">—</span>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedLayer(n);
                                  setIncomeSourceModalLayer(n);
                                }}
                                title={`กดเพื่อดูที่มารายได้ค่าชั้นฝั่งซ้าย Rank ${unilevelRank} ชั้น ${n}`}
                                className={`w-full min-w-0 text-left px-1.5 py-1 sm:px-2 sm:py-1 rounded-lg border transition cursor-pointer group ${
                                  earnedTierUsdt > 0
                                    ? 'bg-emerald-50/90 hover:bg-emerald-100 border-emerald-200'
                                    : 'bg-white/75 hover:bg-white border-[#c6e3ff]'
                                }`}
                              >
                                <div className="leading-tight flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-1 min-w-0">
                                  <div className="min-w-0 w-full sm:w-auto">
                                    <span
                                      className={`font-bold block text-[10px] sm:text-xs whitespace-nowrap ${
                                        earnedTierUsdt > 0 ? 'text-emerald-700' : 'text-[#5a78a1]'
                                      }`}
                                    >
                                      {earnedTierUsdt > 0 ? `+${earnedTierUsdt.toFixed(2)} U` : '0.00 U'}
                                    </span>
                                    <span className="text-[8.5px] sm:text-[9.5px] text-[#6d8aad] block leading-tight">
                                      เต็ม{' '}
                                      <span className="whitespace-nowrap">
                                        +{fmtNum(maxTierUsdt)} U
                                      </span>
                                    </span>
                                  </div>
                                  <span
                                    className={`text-[9px] sm:text-[9.5px] font-sans font-bold px-1.5 py-0.5 rounded-md shrink-0 whitespace-nowrap self-stretch sm:self-auto text-center ${
                                      earnedTierUsdt > 0
                                        ? 'bg-emerald-600 text-white group-hover:bg-emerald-700'
                                        : 'bg-[#e3f2ff] text-[#0754b9] group-hover:bg-[#cde8ff]'
                                    }`}
                                  >
                                    ที่มา ›
                                  </span>
                                </div>
                              </button>
                            )}
                          </td>
                          <td
                            className={`px-1.5 py-2 sm:px-2.5 sm:py-2.5 rounded-r-[10px] min-w-0 align-middle ${
                              isRowSelected ? 'bg-[#dff2ff]' : 'bg-[#edf7ff]'
                            }`}
                          >
                            {realEntries.length > 0 ? (
                              <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2 min-w-0">
                                <div className="min-w-0 w-full sm:w-auto leading-snug break-words">
                                  <span className="font-bold text-emerald-700 text-[10px] sm:text-xs whitespace-nowrap">
                                    {realEntries.length} รหัส
                                  </span>{' '}
                                  <span className="font-mono text-[9.5px] sm:text-xs text-[#09275f] font-normal break-words">
                                    ({previewIds}
                                    {extraMore})
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedLayer(n);
                                    setPopupTypeFilter('ALL');
                                    setPopupSearch('');
                                    setLayerPopupModal(n);
                                  }}
                                  className="w-full sm:w-auto justify-center px-2 py-1 sm:px-2.5 sm:py-1 rounded-lg bg-[#087cf4] hover:bg-[#0568d0] text-white text-[9.5px] sm:text-[10.5px] font-bold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer shadow-xs shrink-0"
                                >
                                  <Users className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
                                  <span>ดูข้อมูลสมาชิก</span>
                                </button>
                              </div>
                            ) : (
                              <span className="text-[#6d8aad] text-[10px] sm:text-xs">ว่าง (0 รหัส)</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-[10.5px] sm:text-[11px] text-[#58769d] leading-relaxed mt-2 px-0.5">
                กำลังแสดงข้อมูล 1 แตก 2 ของ <strong className="text-[#0754b9]">Rank {unilevelRank}</strong> ({fmtNum(rankUnitPrice)} U · ค่าชั้น 2% ฝั่งซ้าย = +{levelRateUsdt.toFixed(2)} U/รหัส) ·
                แถวสีฟ้าคือชั้นที่กำลังเลือกดูอยู่ · กด <strong className="text-emerald-700">ที่มา ›</strong> หรือ{' '}
                <strong className="text-[#0754b9]">ดูข้อมูลสมาชิก</strong> เพื่อดูรายชื่อจริงของชั้นนั้น
              </p>
            </>
          );
        })()}
      </section>


      {/* POPUP MODAL 2: LAYER MEMBER LIST */}
      {layerPopupModal !== null &&
        (() => {
          const rawEntries: UnilevelLayerEntry[] =
            layerPopupModal === 'all'
              ? Array.from({ length: 16 }, (_, idx) => layersMap[idx] || []).flat()
              : layersMap[layerPopupModal] || [];

          const qTrim = popupSearch.trim().toLowerCase().replace(/^#/, '');
          const filtered = rawEntries.filter((e) => {
            const tag = getShortTypeTag(e.node);
            if (popupTypeFilter !== 'ALL' && tag !== popupTypeFilter) return false;
            if (qTrim) {
              const mId = getMainId(e.node);
              const cloneSeq = isCloneNode(e.node) ? cloneSeqByNodeId.get(Number(e.node.id)) || 0 : 0;
              const hay = `${mId} ${e.node.id} ${e.node.owner} ${getDisplayStatusText(e.node, cloneSeq)}`.toLowerCase();
              if (!hay.includes(qTrim)) return false;
            }
            return true;
          });

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
              onClick={() => setLayerPopupModal(null)}
            >
              <div
                className="w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-[22px] bg-white border border-[#9fd4ff] shadow-2xl flex flex-col text-[#09265f]"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-3.5 sm:p-4 bg-gradient-to-r from-[#031c5c] via-[#075ed0] to-[#0545a8] text-white flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm sm:text-base font-black">
                      {layerPopupModal === 'all'
                        ? `👥 สมาชิกจริงทั้งหมด (ใต้ #${rootCanonicalMainId} · Rank ${unilevelRank})`
                        : layerPopupModal === 0
                        ? `👥 สมาชิกชั้นเริ่มต้น (หัวผัง #${rootCanonicalMainId} · Rank ${unilevelRank})`
                        : `👥 สมาชิกชั้นที่ ${layerPopupModal} (ใต้ #${rootCanonicalMainId} · Rank ${unilevelRank})`}
                    </h4>
                    <p className="text-[11px] text-cyan-100">
                      พบ {fmtNum(filtered.length)} จาก {fmtNum(rawEntries.length)} รหัส
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLayerPopupModal(null)}
                    className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-3 bg-[#f3f9ff] border-b border-[#d5ebff] flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1 flex-wrap">
                    {(
                      [
                        { k: 'ALL', label: `ทั้งหมด (${rawEntries.length})` },
                        {
                          k: 'MAIN',
                          label: `Main (${rawEntries.filter((x) => getShortTypeTag(x.node) === 'MAIN').length})`,
                        },
                        {
                          k: 'CLONE',
                          label: `โคลน (${rawEntries.filter((x) => getShortTypeTag(x.node) === 'CLONE').length})`,
                        },
                        {
                          k: 'AUTO',
                          label: `Auto (${rawEntries.filter((x) => getShortTypeTag(x.node) === 'AUTO').length})`,
                        },
                        {
                          k: 'EXTRA',
                          label: `Extra (${rawEntries.filter((x) => getShortTypeTag(x.node) === 'EXTRA').length})`,
                        },
                      ] as const
                    ).map((f) => (
                      <button
                        key={`u-pf-${f.k}`}
                        type="button"
                        onClick={() => setPopupTypeFilter(f.k)}
                        className={`px-2 py-1 rounded-lg text-[10.5px] font-bold cursor-pointer ${
                          popupTypeFilter === f.k
                            ? 'bg-[#087cf4] text-white'
                            : 'bg-white text-[#0754b9] border border-[#b8ddff]'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={popupSearch}
                    onChange={(e) => setPopupSearch(e.target.value)}
                    placeholder="กรอง ID / Wallet / โคลน..."
                    className="w-full sm:w-48 px-3 py-1.5 rounded-lg border border-[#b5dbff] bg-white text-xs text-[#09265f]"
                  />
                </div>

                <div className="p-3 overflow-y-auto space-y-2">
                  {filtered.length === 0 ? (
                    <div className="py-8 text-center text-xs text-[#5a78a1]">
                      ไม่พบสมาชิกที่ตรงตามเงื่อนไข
                    </div>
                  ) : (
                    filtered.map((e) => {
                      const n = e.node;
                      const mId = getMainId(n);
                      const isClone = isCloneNode(n);
                      const cloneSeq = isClone ? cloneSeqByNodeId.get(Number(n.id)) || 0 : 0;

                      return (
                        <div
                          key={`u-mem-${e.layer}-${n.id}`}
                          className="p-2.5 rounded-xl bg-[#f7fbff] border border-[#cde6ff] flex items-center justify-between gap-2 flex-wrap"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-1.5 py-0.5 rounded bg-[#0754b9] text-white text-[10px] font-black font-mono">
                                ID #{mId}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-[#e3f2ff] text-[#0754b9] text-[10px] font-bold">
                                {e.layer === 0
                                  ? 'ชั้นเริ่มต้น'
                                  : `ชั้น ${e.layer} · ${e.side === 'LEFT' ? 'ซ้าย (2%)' : 'ขวา (รีเบิร์ธ)'}`}
                              </span>
                              <span className="text-[11px] font-bold text-[#09265f]">
                                {getDisplayStatusText(n, cloneSeq)} · Rank {unilevelRank}
                              </span>
                            </div>
                            <div className="text-[10.5px] text-[#55769b] font-mono tabular-nums">
                              {Number(n.id) !== mId ? `โหนด #${n.id} · ` : ''}
                              ใต้ #{getMainId(nodeMap.get(e.parentId), e.parentId)} · ผู้แนะนำ #
                              {n.directSponsorNodeId || 1} · {shortAddr(n.owner)}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                focusAsRoot(Number(n.id));
                                setLayerPopupModal(null);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#087cf4] hover:bg-[#0568d0] text-white text-[10.5px] font-bold cursor-pointer"
                            >
                              เปิดผัง #{mId}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setLayerPopupModal(null);
                                onOpenMatrixForId(mId, unilevelRank);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-white border border-[#9fd4ff] text-[#0754b9] text-[10.5px] font-bold hover:bg-[#eef8ff] cursor-pointer"
                            >
                              Matrix
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          );
        })()}

      {/* POPUP MODAL 3: SEARCH MODAL */}
      {isSearchModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
          onClick={() => setIsSearchModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-[22px] bg-gradient-to-br from-white to-[#eef7ff] border-2 border-[#9cd4ff] shadow-2xl flex flex-col text-[#09265f]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 sm:p-4 border-b border-[#cbe6ff] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-sm sm:text-base font-black">
                  🔍 ค้นหาในผัง 1 แตก 2 (Rank {unilevelRank})
                </h4>
                <p className="text-[11px] text-[#55769b]">
                  พิมพ์ #ID, เช่น #3 ครั้งที่2, ชั้น 2 หรือ Wallet 0x...
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSearchModalOpen(false)}
                className="w-9 h-9 rounded-full bg-white border border-[#b8dfff] flex items-center justify-center cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 sm:p-4 space-y-3 overflow-y-auto">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  runUnilevelSearch();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="พิมพ์ #ID, #3 ครั้งที่2, ชั้น2 หรือ 0x..."
                  className="flex-1 min-w-0 px-3.5 py-2.5 rounded-2xl border border-[#a9d7ff] bg-white text-sm text-[#09265f] focus:outline-none focus:border-[#087cf4]"
                  autoFocus
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#22caff] to-[#0758d4] text-white text-xs sm:text-sm font-black cursor-pointer shrink-0"
                >
                  ค้นหา
                </button>
              </form>

              <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                <span className="text-[#5a78a1] font-bold">ค้นหาด่วน:</span>
                {[1, 2, 3].map((qId) => (
                  <button
                    key={`uq-${qId}`}
                    type="button"
                    onClick={() => {
                      const val = String(qId);
                      setSearchInput(val);
                      runUnilevelSearch(val);
                    }}
                    className="px-2.5 py-1 rounded-full bg-white border border-[#b5dbff] font-mono font-bold text-[#0754b9] hover:bg-[#e5f3ff] cursor-pointer"
                  >
                    ID #{qId}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('#3 ครั้งที่2');
                    runUnilevelSearch('#3 ครั้งที่2');
                  }}
                  className="px-2.5 py-1 rounded-full bg-sky-50 border border-sky-200 font-bold text-sky-800 hover:bg-sky-100 cursor-pointer"
                >
                  #3 ครั้งที่2
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('ชั้น 1');
                    runUnilevelSearch('ชั้น 1');
                  }}
                  className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 font-bold text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                >
                  ชั้น 1
                </button>
              </div>

              {searchResult && (
                <div className="space-y-2">
                  <div
                    className={`p-2.5 rounded-xl text-xs font-bold border ${
                      searchResult.isError
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : 'bg-[#e7f4ff] border-[#a5d5ff] text-[#0754b9]'
                    }`}
                  >
                    {searchResult.message}
                  </div>

                  {searchResult.hits.map((h) => (
                    <div
                      key={`u-hit-${h.node.id}`}
                      className="p-2.5 rounded-xl bg-white border border-[#cde6ff] space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-[#0754b9] text-white text-[11px] font-black font-mono">
                            #{h.mainId}
                          </span>
                          <strong className="text-xs font-black text-[#09265f]">
                            {getDisplayStatusText(h.node, h.cloneSeq)} · Rank {unilevelRank}
                          </strong>
                          {h.layerFromRoot !== null ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              ชั้น {h.layerFromRoot} ({h.sideFromParent === 'LEFT' ? 'ซ้าย' : h.sideFromParent === 'RIGHT' ? 'ขวา' : 'ROOT'})
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">
                              อยู่นอกสายใต้ #{rootCanonicalMainId}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              focusAsRoot(Number(h.node.id));
                              setIsSearchModalOpen(false);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#087cf4] hover:bg-[#0568d0] text-white text-[10.5px] font-bold cursor-pointer"
                          >
                            เปิดผังนี้
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsSearchModalOpen(false);
                              onOpenMatrixForId(h.mainId, unilevelRank);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#f2f9ff] border border-[#9fd4ff] text-[#0754b9] text-[10.5px] font-bold cursor-pointer"
                          >
                            Matrix
                          </button>
                        </div>
                      </div>
                      <div className="text-[10.5px] text-[#55769b] font-mono tabular-nums">
                        โหนด #{h.node.id} · เส้นทาง: {h.pathFromGlobal.join(' → ')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* POPUP MODAL 4: LEFT-SIDE LEVEL INCOME SOURCES BY LAYER (MATCHING MATRIX) */}
      {incomeSourceModalLayer !== null &&
        incomeSourceModalLayer >= 1 &&
        (() => {
          const layerNum = incomeSourceModalLayer;
          const layerEntries = layersMap[layerNum] || [];
          const leftEntries = layerEntries.filter((e) => e.side === 'LEFT');
          const rightEntries = layerEntries.filter((e) => e.side === 'RIGHT');
          const rankUnitPrice = RANK_PRICES_USDT[unilevelRank - 1] || 5;
          const levelRateUsdt = Number((rankUnitPrice * 0.02).toFixed(2));
          const earnedTierUsdt = Number((leftEntries.length * levelRateUsdt).toFixed(2));
          const maxTierUsdt = Number((2 ** (layerNum - 1) * levelRateUsdt).toFixed(2));

          const rootLevelHistory: any[] = rankIncomeSummary.levelItems;
          const findLevelHistoryRecord = (fromNodeId: number) =>
            rootLevelHistory.find(
              (h: any) =>
                Number(h.fromNodeId || 0) === fromNodeId &&
                (Number(h.toNodeId || 0) === 0 || Number(h.toNodeId) === effectiveRootId)
            ) || rootLevelHistory.find((h: any) => Number(h.fromNodeId || 0) === fromNodeId);

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
              onClick={() => setIncomeSourceModalLayer(null)}
            >
              <div
                className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-[22px] sm:rounded-[24px] bg-gradient-to-br from-white to-[#e3f4ff] border-2 border-[#a9ddff] shadow-2xl p-3 sm:p-5 text-[#09265f] space-y-3"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-2 border-b border-[#b8e5ff] pb-2.5">
                  <div className="min-w-0">
                    <h3 className="text-sm sm:text-lg font-black text-[#09265f] flex items-center gap-1.5">
                      <Coins className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 shrink-0" />
                      <span>
                        ที่มารายได้ค่าชั้นฝั่งซ้าย — ชั้นที่ {layerNum} (Rank {unilevelRank})
                      </span>
                    </h3>
                    <p className="text-[10.5px] sm:text-[11px] font-semibold text-[#45668f] mt-0.5">
                      ใต้ ID #{rootCanonicalMainId} · ค่าชั้น 2% ของราคา Rank {unilevelRank} ({fmtNum(rankUnitPrice)} U) = +{levelRateUsdt.toFixed(2)} U / รหัสฝั่งซ้าย
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIncomeSourceModalLayer(null)}
                    className="p-1.5 rounded-xl bg-white hover:bg-blue-50 border border-[#b8e5ff] text-[#0756bc] cursor-pointer shrink-0"
                    aria-label="ปิดหน้าต่าง"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Rank Selector inside Modal */}
                <div className="flex items-center justify-between gap-2 flex-wrap bg-white/80 px-2.5 py-1.5 rounded-xl border border-[#c5e2ff] text-[11px]">
                  <span className="font-bold text-[#09275f]">ดูข้อมูลเฉพาะ Rank:</span>
                  <select
                    value={unilevelRank}
                    onChange={(e) => {
                      setUnilevelRank(Number(e.target.value));
                      setFocusedRootId(null);
                    }}
                    className="px-2 py-1 rounded-lg bg-[#eff8ff] border border-[#9fd4ff] font-bold text-[#0754b9] text-[11px] cursor-pointer"
                  >
                    {RANK_PRICES_USDT.map((price, idx) => (
                      <option key={`modal-u-rank-${idx + 1}`} value={idx + 1}>
                        Rank {idx + 1} ({fmtNum(price)} U)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quick Layer Switcher */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
                  {Array.from({ length: 15 }, (_, idx) => idx + 1).map((lNum) => {
                    const lEntries = layersMap[lNum] || [];
                    const lLeftCount = lEntries.filter((e) => e.side === 'LEFT').length;
                    if (lEntries.length === 0 && lNum !== layerNum) return null;
                    const active = lNum === layerNum;
                    return (
                      <button
                        key={`u-inc-src-${lNum}`}
                        type="button"
                        onClick={() => {
                          setSelectedLayer(lNum);
                          setIncomeSourceModalLayer(lNum);
                        }}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap border cursor-pointer shrink-0 ${
                          active
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-[#0756bc] border-[#b8e5ff] hover:bg-[#eef8ff]'
                        }`}
                      >
                        ชั้น {lNum} (+{(lLeftCount * levelRateUsdt).toFixed(2)} U)
                      </button>
                    );
                  })}
                </div>

                {/* 3 Summary KPI Cards */}
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center text-xs">
                  <div className="min-w-0 p-2 sm:p-2.5 rounded-xl bg-white border border-[#b8e5ff]">
                    <div className="text-[9.5px] sm:text-[10px] text-[#55769b] truncate">
                      รายได้ชั้นที่ {layerNum}
                    </div>
                    <strong className="text-xs sm:text-base font-black text-emerald-700 font-mono block">
                      +{earnedTierUsdt.toFixed(2)} U
                    </strong>
                    <div className="text-[9.5px] sm:text-[10px] text-[#5a78a1] truncate">
                      เต็ม +{fmtNum(maxTierUsdt)} U
                    </div>
                  </div>
                  <div className="min-w-0 p-2 sm:p-2.5 rounded-xl bg-white border border-[#b8e5ff]">
                    <div className="text-[9.5px] sm:text-[10px] text-[#55769b] truncate">
                      ฝั่งซ้าย (จ่าย 2%)
                    </div>
                    <strong className="text-xs sm:text-base font-black text-[#0754b9] font-mono block">
                      {leftEntries.length} รหัส
                    </strong>
                    <div className="text-[9.5px] sm:text-[10px] text-[#5a78a1] truncate">
                      +{levelRateUsdt.toFixed(2)} U/รหัส
                    </div>
                  </div>
                  <div className="min-w-0 p-2 sm:p-2.5 rounded-xl bg-white border border-[#b8e5ff]">
                    <div className="text-[9.5px] sm:text-[10px] text-[#55769b] truncate">
                      ฝั่งขวา (Rebirth)
                    </div>
                    <strong className="text-xs sm:text-base font-black text-[#35567e] font-mono block">
                      {rightEntries.length} รหัส
                    </strong>
                    <div className="text-[9.5px] sm:text-[10px] text-[#5a78a1] truncate">
                      ไม่คิดค่าชั้น 2%
                    </div>
                  </div>
                </div>

                {/* Paying Left-Side Entries List */}
                {leftEntries.length === 0 ? (
                  <div className="p-5 text-center rounded-2xl bg-white border border-[#b8e5ff] text-xs font-semibold text-[#54759c] space-y-1">
                    <div>ยังไม่มีสมาชิกฝั่งซ้ายในชั้นที่ {layerNum} (รายได้ปัจจุบัน 0.00 U)</div>
                    <div className="text-[11px] text-[#6d8aad]">
                      รายได้ค่าชั้นจะเกิดจากรหัสที่วางในตำแหน่งฝั่งซ้าย (2% ของราคา Rank {unilevelRank})
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                    <div className="text-[11px] font-black text-[#09265f] px-0.5">
                      รายการไอดีที่สร้างรายได้ค่าชั้นฝั่งซ้าย ({leftEntries.length} รหัส)
                    </div>
                    {leftEntries.map((entry) => {
                      const n = entry.node;
                      const mId = getMainId(n);
                      const tag = getShortTypeTag(n);
                      const isClone = isCloneNode(n);
                      const cloneSeq = isClone ? cloneSeqByNodeId.get(Number(n.id)) || 0 : 0;
                      const statusLabel = getDisplayStatusText(n, cloneSeq);
                      const matchedHistory = findLevelHistoryRecord(Number(n.id));
                      const badgeClass =
                        tag === 'AUTO'
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : tag === 'EXTRA'
                          ? 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300'
                          : tag === 'CLONE'
                          ? 'bg-sky-100 text-sky-800 border-sky-300'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-300';

                      return (
                        <div
                          key={`u-inc-left-${layerNum}-${n.id}`}
                          className="p-3 rounded-xl bg-white border border-[#b8e5ff] flex items-start justify-between gap-2.5 text-xs shadow-2xs"
                        >
                          <div className="min-w-0 space-y-1 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-black text-sm text-[#0754b9]">
                                ID #{mId}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${badgeClass}`}
                              >
                                {statusLabel}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono text-[10px] font-bold">
                                ซ้ายใต้ #{getMainId(nodeMap.get(entry.parentId), entry.parentId)}
                              </span>
                            </div>

                            <div className="text-[10px] font-mono text-[#6283aa] flex items-center gap-2 flex-wrap">
                              <span>Wallet: {shortAddr(n.owner)}</span>
                              <span>· โหนด #{n.id}</span>
                              <span>· ชั้นที่ {layerNum} (Rank {unilevelRank})</span>
                              {matchedHistory?.timestamp && (
                                <span>
                                  · {new Date(matchedHistory.timestamp).toLocaleString('th-TH')}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <strong className="text-sm font-black font-mono text-emerald-700">
                              +{Number(matchedHistory?.amountUsdt || levelRateUsdt).toFixed(2)} U
                            </strong>
                            <button
                              type="button"
                              onClick={() => {
                                focusAsRoot(Number(n.id));
                                setIncomeSourceModalLayer(null);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#087cf4] hover:bg-[#0568d0] text-white text-[10.5px] font-bold cursor-pointer whitespace-nowrap"
                            >
                              เปิดผัง #{mId}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
    </div>
  );
};

export default Dashboard2UnilevelPanel;
