import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { RefreshCw, Search, ArrowLeft, ExternalLink, ArrowUp, X, Users, ChevronDown } from 'lucide-react';
import { FractalFlowBrandCard } from './FractalFlowLogo';

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

export interface MatrixTreeNodeRaw {
  id: number;
  rank: number;
  owner: string;
  directSponsor?: string;
  parentId: number;
  leftChild: number;
  rightChild: number;
  isClone?: boolean;
  isExtraId?: boolean;
  originMainId?: number;
  cloneRound?: number;
  cloneSequence?: number;
  directSponsorNodeId?: number;
  originType?: string;
  confirmedOriginType?: string;
  autoSourceMainId?: number;
  createdAt?: string;
  isLeft?: boolean;
}

interface LayerNodeEntry {
  node: MatrixTreeNodeRaw;
  layer: number;
  parentId: number;
  side: 'ROOT' | 'LEFT' | 'RIGHT';
  path: string[];
}

export interface MatrixActiveIdSummary {
  displayId: number;
  mainId: number;
  label: string;
  typeBadge: 'MAIN ID' | 'AUTO ID' | 'CLONE ID' | 'EXTRA ID';
  isSubId: boolean;
  subKind?: 'CLONE' | 'EXTRA';
  subRank?: number;
  subNodeId?: number;
  cloneSequence?: number;
  cloneRound?: number;
  currentRank: number;
  owner: string;
  directSponsorNodeId: number;
  direct30TotalUsdt: number;
  level30TotalUsdt: number;
  totalIncomeUsdt: number;
  vaultRemainingUsdt: number;
  totalClonesCount: number;
  totalAutoIdCount: number;
  totalExtraIdCount: number;
  totalMembersAllRanks: number;
  idMembersCountByRank: Record<number, number>;
}

interface Dashboard2MatrixPanelProps {
  displayId: number;
  currentRank: number;
  initialRank?: number;
  initialRootNodeId?: number | null;
  focusVersion?: number;
  rankCounts: Record<number, number>;
  contractAddress: string;
  refreshTrigger?: any;
  activeIdSummary?: MatrixActiveIdSummary | null;
  allReports?: any[];
  onBackToHome: () => void;
  onBackToMainId?: () => void;
  onOpenUpgradeModal?: () => void;
  onSelectMainId: (idStr: string) => void;
  onSelectSubId?: (target: { kind: 'CLONE' | 'EXTRA'; rank: number; nodeId: number; mainId: number }) => void;
  onOpenFullMatrixCanvas: (targetRank?: number) => void;
  onOpenSwitchId?: () => void;
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

const getNodeTypeLabel = (
  node?: MatrixTreeNodeRaw | null,
  cloneSeq = 0,
  totalClonesForMain = 0
): string => {
  if (!node) return 'Main ID';
  if (isExtraNode(node)) return `Extra ID (จาก #${node.originMainId || node.directSponsorNodeId || '-'})`;
  if (isCloneNode(node)) {
    if (cloneSeq > 0) {
      return totalClonesForMain > 0
        ? `โคลนนิ่ง ครั้งที่ ${cloneSeq} (ทั้งหมด ${totalClonesForMain})`
        : `โคลนนิ่ง ครั้งที่ ${cloneSeq}`;
    }
    return `โคลนนิ่ง (จาก Main #${node.originMainId || '-'})`;
  }
  if (isAutoNode(node)) {
    return 'Auto ID';
  }
  return 'Main ID';
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

export const Dashboard2MatrixPanel: React.FC<Dashboard2MatrixPanelProps> = ({
  displayId,
  currentRank,
  initialRank,
  initialRootNodeId,
  focusVersion = 0,
  rankCounts,
  contractAddress,
  refreshTrigger,
  activeIdSummary,
  allReports = [],
  onBackToHome,
  onBackToMainId,
  onOpenUpgradeModal,
  onSelectMainId,
  onSelectSubId,
  onOpenFullMatrixCanvas,
  onOpenSwitchId,
}) => {
  const [matrixRank, setMatrixRank] = useState<number>(() =>
    Math.max(1, Math.min(18, Number(initialRank || currentRank || 1)))
  );
  const [selectedLayer, setSelectedLayer] = useState<number>(0);
  const [focusedRootId, setFocusedRootId] = useState<number | null>(
    initialRootNodeId ? Number(initialRootNodeId) : null
  );
  const [nodes, setNodes] = useState<MatrixTreeNodeRaw[]>([]);
  const [rank1Nodes, setRank1Nodes] = useState<MatrixTreeNodeRaw[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState<boolean>(false);
  const [isRankDropdownOpen, setIsRankDropdownOpen] = useState<boolean>(false);
  const rankDropdownRef = React.useRef<HTMLDivElement | null>(null);
  const [searchTab, setSearchTab] = useState<'all' | 'main' | 'clone' | 'extra' | 'auto' | 'tree'>('all');
  const [pendingFocusOriginMainId, setPendingFocusOriginMainId] = useState<number | null>(null);
  const [layerPopupModal, setLayerPopupModal] = useState<number | 'all' | null>(null);
  const [popupTypeFilter, setPopupTypeFilter] = useState<'ALL' | 'MAIN' | 'AUTO' | 'CLONE' | 'EXTRA'>('ALL');
  const [popupSearch, setPopupSearch] = useState<string>('');
  const treeScrollRef = React.useRef<HTMLDivElement | null>(null);
  const treeMeasureRef = React.useRef<HTMLDivElement | null>(null);
  const [autoFitSize, setAutoFitSize] = useState<boolean>(true);
  const [containerInnerWidth, setContainerInnerWidth] = useState<number>(1216);
  const [searchResult, setSearchResult] = useState<{
    query: string;
    message: string;
    isError?: boolean;
    layerJumpHint?: number | null;
    mainHits?: any[];
    cloneHits?: Array<{
      id: number;
      rank: number;
      originMainId: number;
      cloneSequence: number;
      cloneRound: number;
      parentId: number;
      side: string;
      owner: string;
      incomeUsdt: number;
      direct30Usdt: number;
      level30Usdt: number;
      vault35Usdt: number;
    }>;
    extraHits?: Array<{
      id: number;
      rank: number;
      originMainId: number;
      parentId: number;
      side: string;
      owner: string;
      incomeUsdt: number;
      direct30Usdt: number;
      level30Usdt: number;
      vault35Usdt: number;
    }>;
    autoHits?: Array<{
      id: number;
      rank: number;
      spawnedByMainId: number;
      parentId: number;
      side: string;
      owner: string;
      currentMaxRank: number;
      incomeUsdt: number;
      vaultRemainingUsdt: number;
    }>;
    matches?: Array<{
      node: MatrixTreeNodeRaw;
      layerInSubtree?: number;
      layerFromGlobal?: number;
    }>;
  } | null>(null);

  useEffect(() => {
    if (initialRank && initialRank >= 1 && initialRank <= 18) {
      setMatrixRank(initialRank);
      setSelectedLayer(0);
    }
  }, [initialRank, focusVersion]);

  useEffect(() => {
    setFocusedRootId(initialRootNodeId ? Number(initialRootNodeId) : null);
    setSelectedLayer(0);
    setSearchResult(null);
  }, [displayId, initialRootNodeId, focusVersion]);

  useEffect(() => {
    if (!isRankDropdownOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (rankDropdownRef.current && !rankDropdownRef.current.contains(e.target as Node)) {
        setIsRankDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [isRankDropdownOpen]);

  const fetchRankNodes = useCallback(async (opts?: { silent?: boolean } | unknown) => {
    const silent = Boolean(opts && typeof opts === 'object' && 'silent' in opts && (opts as { silent?: boolean }).silent);
    if (!silent) setLoading(true);
    setLoadError('');
    try {
      const hasSameNodes = (prev: MatrixTreeNodeRaw[], next: MatrixTreeNodeRaw[]) => {
        if (prev.length !== next.length) return false;
        for (let i = 0; i < prev.length; i++) {
          const p = prev[i];
          const n = next[i];
          if (
            Number(p.id) !== Number(n.id) ||
            Number(p.leftChild || 0) !== Number(n.leftChild || 0) ||
            Number(p.rightChild || 0) !== Number(n.rightChild || 0)
          ) {
            return false;
          }
        }
        return true;
      };

      const qs = new URLSearchParams({ rank: String(matrixRank) });
      if (contractAddress) qs.set('contract', contractAddress);
      const res = await fetch(`/api/matrix/tree-nodes?${qs.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      const json = await safeReadJson(res);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || 'ไม่สามารถโหลดข้อมูลผัง Matrix ได้');
      }
      const fetched = Array.isArray(json.nodes) ? json.nodes : [];
      setNodes((prev) => (hasSameNodes(prev, fetched) ? prev : fetched));
      if (matrixRank === 1) {
        setRank1Nodes((prev) => (hasSameNodes(prev, fetched) ? prev : fetched));
      } else {
        const qsR1 = new URLSearchParams({ rank: '1' });
        if (contractAddress) qsR1.set('contract', contractAddress);
        fetch(`/api/matrix/tree-nodes?${qsR1.toString()}`, {
          headers: { Accept: 'application/json' },
        })
          .then((r) => safeReadJson(r))
          .then((r1Json) => {
            if (r1Json?.success && Array.isArray(r1Json.nodes)) {
              const r1Fetched = r1Json.nodes as MatrixTreeNodeRaw[];
              setRank1Nodes((prev) => (hasSameNodes(prev, r1Fetched) ? prev : r1Fetched));
            }
          })
          .catch(() => {});
      }
    } catch (err: any) {
      if (!silent) {
        setLoadError(err?.message || 'เกิดข้อผิดพลาดในการโหลดผัง Matrix');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [matrixRank, contractAddress]);

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

  const { nodeMap, cloneIdsByMainId, cloneSeqByNodeId } = useMemo(() => {
    const m = new Map<number, MatrixTreeNodeRaw>();
    const clonesByMain = new Map<number, number[]>();
    const sorted = [...nodes].sort((a, b) => Number(a.id) - Number(b.id));
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
        const perMainSeq = list.indexOf(Number(n.id)) + 1;
        seqMap.set(Number(n.id), perMainSeq);
      }
    }
    return { nodeMap: m, cloneIdsByMainId: clonesByMain, cloneSeqByNodeId: seqMap };
  }, [nodes]);

  const activeIdNodeInCurrentRank = useMemo(() => {
    if (activeIdSummary?.isSubId && activeIdSummary.subRank && activeIdSummary.subNodeId) {
      if (matrixRank !== activeIdSummary.subRank) return null;
      return nodeMap.get(Number(activeIdSummary.subNodeId)) || null;
    }
    if (matrixRank === 1) {
      const r1Node = nodeMap.get(displayId);
      if (r1Node && !isCloneNode(r1Node) && !isExtraNode(r1Node)) return r1Node;
      return null;
    }
    const byOrigin = nodes.find(
      (n) => Number(n.originMainId) === displayId && !isCloneNode(n) && !isExtraNode(n)
    );
    if (byOrigin) return byOrigin;
    const fallback = nodeMap.get(displayId);
    if (
      fallback &&
      !isCloneNode(fallback) &&
      !isExtraNode(fallback) &&
      (Number(fallback.originMainId || 0) === 0 || Number(fallback.originMainId) === displayId)
    ) {
      return fallback;
    }
    return null;
  }, [activeIdSummary, matrixRank, nodeMap, nodes, displayId]);

  const defaultRootId = useMemo(() => {
    if (activeIdNodeInCurrentRank) return Number(activeIdNodeInCurrentRank.id);
    if (nodeMap.has(1)) return 1;
    return nodes.length > 0 ? Number(nodes[0].id) : displayId;
  }, [activeIdNodeInCurrentRank, nodeMap, nodes, displayId]);

  const effectiveRootId = useMemo(() => {
    if (focusedRootId && nodeMap.has(focusedRootId)) return focusedRootId;
    return defaultRootId;
  }, [focusedRootId, nodeMap, defaultRootId]);

  const idEffectiveRank = useMemo(() => {
    if (activeIdSummary?.isSubId && activeIdSummary.subRank) {
      return activeIdSummary.subRank;
    }
    return Math.max(1, Math.min(18, Number(activeIdSummary?.currentRank || currentRank || 1)));
  }, [activeIdSummary, currentRank]);

  const isIdUnlockedInRank = useCallback(
    (r: number) => {
      if (activeIdSummary?.isSubId && activeIdSummary.subRank) {
        return r === activeIdSummary.subRank;
      }
      if (r <= idEffectiveRank) return true;
      if (r === matrixRank && activeIdNodeInCurrentRank) return true;
      return false;
    },
    [activeIdSummary, idEffectiveRank, matrixRank, activeIdNodeInCurrentRank]
  );

  const isSelectedRankUnlockedForId = isIdUnlockedInRank(matrixRank);

  const rootNode = nodeMap.get(effectiveRootId) || null;
  const leftChildNode =
    rootNode && rootNode.leftChild > 0 ? nodeMap.get(Number(rootNode.leftChild)) || null : null;
  const rightChildNode =
    rootNode && rootNode.rightChild > 0 ? nodeMap.get(Number(rootNode.rightChild)) || null : null;

  // Build 5-layer complete slot structure (Layer 0 = 1, Layer 1 = 2, Layer 2 = 4, Layer 3 = 8, Layer 4 = 16 -> 31 positions)
  const fiveLayerSlots = useMemo(() => {
    const layers: Array<Array<MatrixTreeNodeRaw | null>> = [];
    layers[0] = [rootNode];
    for (let depth = 0; depth < 4; depth++) {
      const parentSlots = layers[depth];
      const nextSlots: Array<MatrixTreeNodeRaw | null> = [];
      for (const p of parentSlots) {
        if (!p) {
          nextSlots.push(null, null);
          continue;
        }
        const leftId = Number(p.leftChild || 0);
        const rightId = Number(p.rightChild || 0);
        const leftNode = leftId > 0 && leftId !== Number(p.id) ? nodeMap.get(leftId) || null : null;
        const rightNode = rightId > 0 && rightId !== Number(p.id) ? nodeMap.get(rightId) || null : null;
        nextSlots.push(leftNode, rightNode);
      }
      layers[depth + 1] = nextSlots;
    }
    return layers;
  }, [rootNode, nodeMap]);

  // Bloodline context relative to the current tree owner (ownerMainId)
  const bloodlineContext = useMemo(() => {
    const ownerMainId = getMainId(rootNode, effectiveRootId);
    const sponsorOfMainId = new Map<number, number>();

    const registerSponsorLinks = (list: MatrixTreeNodeRaw[]) => {
      for (const n of list) {
        if (isCloneNode(n)) continue;
        const mId = getMainId(n);
        const spId = Number(n.autoSourceMainId || n.directSponsorNodeId || 0);
        if (mId > 1 && spId > 0 && spId !== mId && !sponsorOfMainId.has(mId)) {
          sponsorOfMainId.set(mId, spId);
        }
      }
    };

    registerSponsorLinks(rank1Nodes);
    registerSponsorLinks(nodes);

    // 1. Uplines above ownerMainId in bloodline (excluding #1 which is handled by rules 5 & 6)
    const uplineNonRootMainIds = new Set<number>();
    let cur = ownerMainId;
    const seenUp = new Set<number>([ownerMainId]);
    for (let step = 0; step < 60; step++) {
      const sp = sponsorOfMainId.get(cur) || 0;
      if (!sp || seenUp.has(sp)) break;
      seenUp.add(sp);
      if (sp !== 1) uplineNonRootMainIds.add(sp);
      cur = sp;
    }

    // 2. Downline bloodline under ownerMainId (direct referrals + their downline referrals)
    const childrenBySponsor = new Map<number, number[]>();
    for (const [childId, spId] of sponsorOfMainId.entries()) {
      const arr = childrenBySponsor.get(spId) || [];
      arr.push(childId);
      childrenBySponsor.set(spId, arr);
    }

    const directReferralMainIds = new Set<number>();
    const downlineBloodlineMainIds = new Set<number>();
    const queue: number[] = [];
    for (const directChildId of childrenBySponsor.get(ownerMainId) || []) {
      if (directChildId > 1 && directChildId !== ownerMainId) {
        directReferralMainIds.add(directChildId);
        if (!downlineBloodlineMainIds.has(directChildId)) {
          downlineBloodlineMainIds.add(directChildId);
          queue.push(directChildId);
        }
      }
    }
    while (queue.length > 0) {
      const c = queue.shift()!;
      for (const nxt of childrenBySponsor.get(c) || []) {
        if (nxt > 1 && nxt !== ownerMainId && !downlineBloodlineMainIds.has(nxt)) {
          downlineBloodlineMainIds.add(nxt);
          queue.push(nxt);
        }
      }
    }

    return {
      ownerMainId,
      sponsorOfMainId,
      uplineNonRootMainIds,
      directReferralMainIds,
      downlineBloodlineMainIds,
    };
  }, [rootNode, effectiveRootId, rank1Nodes, nodes]);

  const getCardAppearance = useCallback(
    (node: MatrixTreeNodeRaw) => {
      const { ownerMainId, sponsorOfMainId, uplineNonRootMainIds, downlineBloodlineMainIds } =
        bloodlineContext;
      const nodeMainId = getMainId(node);
      const isClone = isCloneNode(node);
      const isAuto = isAutoNode(node);
      const isExtra = isExtraNode(node);
      const sourceSponsorId = Number(
        node.autoSourceMainId || node.directSponsorNodeId || sponsorOfMainId.get(nodeMainId) || 0
      );

      // 5 & 6. เฉพาะรหัส #1 และโคลนนิ่งของ #1 -> ทรงกลมสีม่วงสว่างสดใส + ข้อความสีม่วงเข้มคมชัด
      if (nodeMainId === 1 && (!isAuto && !isExtra)) {
        return {
          sphereClass:
            'bg-[radial-gradient(circle_at_30%_24%,#ffffff_0%,#ebd6ff_24%,#c58aff_54%,#9848ec_84%,#7022c4_100%)] border border-[#d8b4fe]/85 shadow-[0_0_13px_rgba(168,85,247,0.26),0_4px_10px_rgba(101,30,184,0.20),inset_0_-4px_9px_rgba(88,28,135,0.26)]',
          topTextClass: 'text-[#2e085c] [text-shadow:0_1px_1px_rgba(255,255,255,0.45)]',
          idTextClass: 'text-[#1b033b] [text-shadow:0_1px_1px_rgba(255,255,255,0.45)]',
          subTextClass: 'text-[#270650] [text-shadow:0_1px_1px_rgba(255,255,255,0.4)]',
          metaTextClass: 'text-[#390c70] [text-shadow:0_1px_1px_rgba(255,255,255,0.38)]',
          categoryHint: isClone ? 'โคลนนิ่งของ #1' : 'เฉพาะรหัส #1',
        };
      }
      // 2. Auto ID ของรหัสหลักเจ้าของผัง -> ทรงกลมมุกแชมเปญ-ทอง (เรืองแสงขอบอ่อน ~25%)
      if (isAuto && (sourceSponsorId === ownerMainId || nodeMainId === ownerMainId)) {
        return {
          sphereClass:
            'bg-[radial-gradient(circle_at_30%_24%,#ffffff_0%,#f8f5ea_26%,#e3dec3_56%,#aba274_84%,#6c6440_100%)] border border-[#cfc698]/75 shadow-[0_0_13px_rgba(220,200,115,0.25),0_4px_10px_rgba(55,45,15,0.18),inset_0_-4px_9px_rgba(80,70,35,0.28)]',
          topTextClass: 'text-[#524a20]',
          idTextClass: 'text-[#242009]',
          subTextClass: 'text-[#453e19]',
          metaTextClass: 'text-[#5b5225]',
          categoryHint: 'Auto ID ของเจ้าของผัง',
        };
      }
      // 3. Extra ID ของรหัสหลักเจ้าของผัง -> ทรงกลมมุกชมพู-ทับทิมเงิน (เรืองแสงขอบอ่อน ~25%)
      if (isExtra && (sourceSponsorId === ownerMainId || nodeMainId === ownerMainId)) {
        return {
          sphereClass:
            'bg-[radial-gradient(circle_at_30%_24%,#ffffff_0%,#faf0f2_26%,#e2c1c7_56%,#ac717c_84%,#6a3b44_100%)] border border-[#d4a5ae]/75 shadow-[0_0_13px_rgba(220,125,145,0.25),0_4px_10px_rgba(65,25,35,0.18),inset_0_-4px_9px_rgba(85,35,45,0.28)]',
          topTextClass: 'text-[#612c38]',
          idTextClass: 'text-[#341119]',
          subTextClass: 'text-[#562430]',
          metaTextClass: 'text-[#6a3541]',
          categoryHint: 'Extra ID ของเจ้าของผัง',
        };
      }
      // 4. Clone ID ของรหัสหลักเจ้าของผัง -> ทรงกลมมุกเขียวมรกต-เงิน (เรืองแสงขอบอ่อน ~25%)
      if (isClone && nodeMainId === ownerMainId) {
        return {
          sphereClass:
            'bg-[radial-gradient(circle_at_30%_24%,#ffffff_0%,#eef9f3_26%,#c1e2d0_56%,#6fa389_84%,#3d6552_100%)] border border-[#8fc4a9]/75 shadow-[0_0_13px_rgba(80,210,145,0.25),0_4px_10px_rgba(20,55,35,0.18),inset_0_-4px_9px_rgba(35,75,55,0.28)]',
          topTextClass: 'text-[#245740]',
          idTextClass: 'text-[#0b3121]',
          subTextClass: 'text-[#1c4b36]',
          metaTextClass: 'text-[#2b6149]',
          categoryHint: 'Clone ID ของเจ้าของผัง',
        };
      }
      // 7. เฉพาะรหัสโคลนนิ่งของอัพไลน์ในสายเลือด -> ทรงกลมน้ำเงินสดสว่าง + ข้อความสีกรมท่าเข้มคมชัด
      if (isClone && nodeMainId !== 1 && uplineNonRootMainIds.has(nodeMainId)) {
        return {
          sphereClass:
            'bg-[radial-gradient(circle_at_30%_24%,#eef8ff_0%,#8ad0ff_25%,#3da3f5_55%,#1b73cb_84%,#0f4e99_100%)] border border-[#8ad0ff]/80 shadow-[0_0_14px_rgba(56,178,255,0.26),0_4px_11px_rgba(12,68,140,0.22),inset_0_-5px_10px_rgba(9,56,118,0.28)]',
          topTextClass: 'text-[#062654] [text-shadow:0_1px_1px_rgba(235,248,255,0.45)]',
          idTextClass: 'text-[#031636] [text-shadow:0_1px_1px_rgba(235,248,255,0.45)]',
          subTextClass: 'text-[#052047] [text-shadow:0_1px_1px_rgba(235,248,255,0.4)]',
          metaTextClass: 'text-[#0a3066] [text-shadow:0_1px_1px_rgba(235,248,255,0.38)]',
          categoryHint: 'โคลนนิ่งของอัพไลน์ในสายเลือด',
        };
      }
      // 1. รหัสหลักเจ้าของผัง และรหัสในสายเลือดที่อยู่ใต้รหัสของเจ้าของผัง -> ทรงกลมมุกฟ้า-เงิน (เรืองแสงขอบอ่อน ~25%)
      if (
        nodeMainId === ownerMainId ||
        downlineBloodlineMainIds.has(nodeMainId) ||
        (!isClone && sourceSponsorId === ownerMainId)
      ) {
        return {
          sphereClass:
            'bg-[radial-gradient(circle_at_30%_24%,#ffffff_0%,#eef6fc_26%,#c3d9eb_56%,#7d9bb5_84%,#4c677f_100%)] border border-[#9cbcd6]/75 shadow-[0_0_13px_rgba(115,175,230,0.25),0_4px_10px_rgba(20,45,80,0.16),inset_0_-4px_9px_rgba(45,70,100,0.25)]',
          topTextClass: 'text-[#315076]',
          idTextClass: 'text-[#09275f]',
          subTextClass: 'text-[#24446b]',
          metaTextClass: 'text-[#3e5e84]',
          categoryHint:
            nodeMainId === ownerMainId
              ? 'เจ้าของผัง'
              : sourceSponsorId === ownerMainId
              ? 'ลูกที่แนะนำตรง (สายเลือดใต้เจ้าของผัง)'
              : 'สายเลือดใต้เจ้าของผัง',
        };
      }
      // 8. เฉพาะรหัสที่ไม่ได้อยู่ในสายเลือด -> ทรงกลมสีทองคำอำพัน (เรืองแสงขอบอ่อน ~25%)
      return {
        sphereClass:
          'bg-[radial-gradient(circle_at_30%_24%,#fff8c2_0%,#fbd966_26%,#e3ab25_56%,#b1740b_84%,#6c4102_100%)] border border-[#f2c95c]/75 shadow-[0_0_13px_rgba(245,180,35,0.25),0_4px_10px_rgba(70,40,4,0.22),inset_0_-4px_9px_rgba(95,55,5,0.34)]',
        topTextClass: 'text-[#4d2c03]',
        idTextClass: 'text-[#2a1600]',
        subTextClass: 'text-[#422502]',
        metaTextClass: 'text-[#573306]',
        categoryHint: 'รหัสที่ไม่ได้อยู่ในสายเลือด',
      };
    },
    [bloodlineContext]
  );

  const TREE_CONTENT_WIDTH = 1184;
  const TREE_CANVAS_WIDTH = 1216;
  const TREE_CANVAS_HEIGHT = 548;

  useEffect(() => {
    const el = treeMeasureRef.current;
    if (!el) return;
    const updateWidth = () => {
      const w = el.clientWidth;
      if (w > 0) setContainerInnerWidth(w);
    };
    updateWidth();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => updateWidth());
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const treeScale = useMemo(() => {
    if (!autoFitSize || containerInnerWidth <= 0) return 1;
    return Math.min(1, containerInnerWidth / TREE_CANVAS_WIDTH);
  }, [autoFitSize, containerInnerWidth]);

  const centerTreeViewport = useCallback(() => {
    const el = treeScrollRef.current;
    if (!el) return;
    if (el.scrollWidth > el.clientWidth) {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    }
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => centerTreeViewport());
    return () => cancelAnimationFrame(id);
  }, [centerTreeViewport, effectiveRootId, matrixRank, nodes.length, autoFitSize]);

  // Build layers 0 (Root) -> 1..15 BFS from effectiveRootId + global depth map from #1
  const { layersMap, subtreeDepthMap, globalDepthMap, totalSubtreeCount } = useMemo(() => {
    const layers: Record<number, LayerNodeEntry[]> = {};
    for (let l = 0; l <= 15; l++) layers[l] = [];
    const subDepth = new Map<number, LayerNodeEntry>();
    const globDepth = new Map<number, number>();
    let subTotal = 0;

    if (rootNode) {
      const visited = new Set<number>([Number(rootNode.id)]);
      const rootEntry: LayerNodeEntry = {
        node: rootNode,
        layer: 0,
        parentId: Number(rootNode.parentId || 0),
        side: 'ROOT',
        path: ['ROOT'],
      };
      layers[0] = [rootEntry];
      subDepth.set(Number(rootNode.id), rootEntry);
      subTotal = 1;

      for (let l = 0; l < 15; l++) {
        const current = layers[l];
        if (!current || current.length === 0) break;
        const next: LayerNodeEntry[] = [];
        for (const entry of current) {
          const leftId = Number(entry.node.leftChild || 0);
          if (leftId > 0 && !visited.has(leftId) && nodeMap.has(leftId)) {
            visited.add(leftId);
            const leftNode = nodeMap.get(leftId)!;
            const childEntry: LayerNodeEntry = {
              node: leftNode,
              layer: l + 1,
              parentId: Number(entry.node.id),
              side: 'LEFT',
              path: [...entry.path, `L(#${leftId})`],
            };
            next.push(childEntry);
            subDepth.set(leftId, childEntry);
            subTotal += 1;
          }
          const rightId = Number(entry.node.rightChild || 0);
          if (rightId > 0 && !visited.has(rightId) && nodeMap.has(rightId)) {
            visited.add(rightId);
            const rightNode = nodeMap.get(rightId)!;
            const childEntry: LayerNodeEntry = {
              node: rightNode,
              layer: l + 1,
              parentId: Number(entry.node.id),
              side: 'RIGHT',
              path: [...entry.path, `R(#${rightId})`],
            };
            next.push(childEntry);
            subDepth.set(rightId, childEntry);
            subTotal += 1;
          }
        }
        layers[l + 1] = next;
      }
    }

    // Compute global depth starting from #1 (Layer 0 = Root #1)
    const globalRoot = nodeMap.get(1) || nodes[0];
    if (globalRoot) {
      const gVisited = new Set<number>([Number(globalRoot.id)]);
      const queue: Array<{ id: number; depth: number }> = [{ id: Number(globalRoot.id), depth: 0 }];
      globDepth.set(Number(globalRoot.id), 0);
      while (queue.length > 0) {
        const cur = queue.shift()!;
        const n = nodeMap.get(cur.id);
        if (!n) continue;
        for (const cid of [Number(n.leftChild || 0), Number(n.rightChild || 0)]) {
          if (cid > 0 && !gVisited.has(cid) && nodeMap.has(cid)) {
            gVisited.add(cid);
            globDepth.set(cid, cur.depth + 1);
            queue.push({ id: cid, depth: cur.depth + 1 });
          }
        }
      }
    }

    return {
      layersMap: layers,
      subtreeDepthMap: subDepth,
      globalDepthMap: globDepth,
      totalSubtreeCount: subTotal,
    };
  }, [rootNode, nodeMap, nodes]);

  const currentLayerEntries = layersMap[selectedLayer] || [];
  const theoreticalCapacity = 2 ** selectedLayer;

  const chooseLayer = (n: number) => {
    const clamped = Math.max(0, Math.min(15, n));
    setSelectedLayer(clamped);
  };

  const focusNodeAsRoot = (nodeId: number) => {
    if (!nodeMap.has(nodeId)) return;
    setFocusedRootId(nodeId);
    setSelectedLayer(0);
  };

  useEffect(() => {
    if (!pendingFocusOriginMainId || nodes.length === 0) return;
    const matchNode =
      matrixRank === 1
        ? nodeMap.get(pendingFocusOriginMainId)
        : nodes.find(
            (n) =>
              Number(n.originMainId) === pendingFocusOriginMainId &&
              !isCloneNode(n) &&
              !isExtraNode(n)
          ) || nodeMap.get(pendingFocusOriginMainId);
    if (matchNode) {
      setFocusedRootId(Number(matchNode.id));
      setSelectedLayer(0);
    }
    setPendingFocusOriginMainId(null);
  }, [pendingFocusOriginMainId, nodes, nodeMap, matrixRank]);

  const jumpToRankAndNode = (targetRank: number, targetNodeId?: number | null, originMainId?: number) => {
    const safeRank = Math.max(1, Math.min(18, Number(targetRank || 1)));
    setMatrixRank(safeRank);
    setSelectedLayer(0);
    if (targetNodeId && targetNodeId > 0) {
      setFocusedRootId(targetNodeId);
      setPendingFocusOriginMainId(null);
    } else if (originMainId && originMainId > 0) {
      setFocusedRootId(null);
      setPendingFocusOriginMainId(originMainId);
    } else {
      setFocusedRootId(null);
      setPendingFocusOriginMainId(null);
    }
    setIsSearchModalOpen(false);
  };

  const runMatrixSearch = (overrideQuery?: string) => {
    const raw = (overrideQuery ?? searchInput).trim();
    if (!raw) {
      setSearchResult({
        query: '',
        message: 'กรุณากรอกเลข ID (เช่น 3), Wallet (0x...) หรือเลขชั้น (เช่น ชั้น 5) ที่ต้องการค้นหา',
        isError: true,
      });
      setIsSearchModalOpen(true);
      return;
    }

    setSearchTab('all');
    setIsSearchModalOpen(true);

    // Explicit layer command: e.g. "ชั้น 0", "ชั้น 5", "layer 5", "L5"
    const explicitLayerMatch = raw.match(/^(?:ชั้น|layer|l)\s*(\d{1,2})$/i);
    if (explicitLayerMatch) {
      const n = Number(explicitLayerMatch[1]);
      if (n >= 0 && n <= 15) {
        chooseLayer(n);
        const foundCount = (layersMap[n] || []).length;
        setSearchResult({
          query: raw,
          layerJumpHint: n,
          message: `แสดงผังชั้นที่ ${n} (Rank ${matrixRank}) แล้ว · ความจุตามทฤษฎี ${fmtNum(
            2 ** n
          )} ตำแหน่ง · พบสมาชิกจริงในชั้นนี้ ${foundCount} รหัส`,
          matches: (layersMap[n] || []).slice(0, 30).map((entry) => ({
            node: entry.node,
            layerInSubtree: entry.layer,
            layerFromGlobal: globalDepthMap.get(Number(entry.node.id)),
          })),
        });
        return;
      }
      setSearchResult({
        query: raw,
        message: 'เลขชั้นต้องอยู่ระหว่าง 0–15 เท่านั้น',
        isError: true,
      });
      return;
    }

    const reportByMainId = new Map<number, any>();
    for (const r of allReports) {
      if (!r.isClone && !r.isExtraId && Number(r.id) > 0) {
        reportByMainId.set(Number(r.id), r);
      }
    }

    // Numeric ID search: e.g. "3", "#3", "ID 3", "ID #3" -> show ALL data of that ID (Main, Clones, Extra IDs, Auto IDs, Matrix nodes)
    const idMatch = raw.match(/^(?:#|id\s*#?)?\s*(\d+)$/i);
    if (idMatch) {
      const targetId = Number(idMatch[1]);
      const layerHint = targetId >= 0 && targetId <= 15 ? targetId : null;

      if (targetId === 0) {
        chooseLayer(0);
        setSearchResult({
          query: raw,
          layerJumpHint: 0,
          message: `กระโดดไปชั้น 0 (Root #${effectiveRootId}) ของ Rank ${matrixRank} แล้ว`,
          matches: (layersMap[0] || []).map((entry) => ({
            node: entry.node,
            layerInSubtree: entry.layer,
            layerFromGlobal: globalDepthMap.get(Number(entry.node.id)),
          })),
        });
        return;
      }

      const mainRep = reportByMainId.get(targetId) || null;
      const mainHits: any[] = mainRep ? [mainRep] : [];

      const cloneMap = new Map<string, any>();
      const extraMap = new Map<string, any>();
      const autoMap = new Map<number, any>();

      // 1) Collect all Clones, Extra IDs, Auto IDs belonging to Main #targetId
      if (mainRep) {
        for (const c of mainRep.clonesSpawned || []) {
          const r = Number(c.rank || 1);
          const nid = Number(c.id || 0);
          const d30 = Number(c.direct30TotalUsdt || 0);
          const l30 = Number(c.level30TotalUsdt || 0);
          cloneMap.set(`${r}-${nid}`, {
            id: nid,
            rank: r,
            originMainId: targetId,
            cloneSequence: Number(c.cloneSequence || 1),
            cloneRound: Number(c.cloneRound || 1),
            parentId: Number(c.parentId || 0),
            side: String(c.side || ''),
            owner: String(c.owner || mainRep.owner || ''),
            direct30Usdt: d30,
            level30Usdt: l30,
            incomeUsdt: Number((d30 + l30).toFixed(2)),
            vault35Usdt: Number(c.vault35GrossTotalUsdt || 0),
          });
        }
        for (const ex of mainRep.autoExtraIdsSpawned || []) {
          const r = Number(ex.rank || 4);
          const nid = Number(ex.id || 0);
          const d30 = Number(ex.direct30TotalUsdt || 0);
          const l30 = Number(ex.level30TotalUsdt || 0);
          extraMap.set(`${r}-${nid}`, {
            id: nid,
            rank: r,
            originMainId: targetId,
            parentId: Number(ex.parentId || 0),
            side: String(ex.side || ''),
            owner: String(ex.owner || mainRep.owner || ''),
            direct30Usdt: d30,
            level30Usdt: l30,
            incomeUsdt: Number((d30 + l30).toFixed(2)),
            vault35Usdt: Number(ex.vault35GrossTotalUsdt || 0),
          });
        }
        for (const au of mainRep.autoIdsSpawned || []) {
          const aid = Number(au.id || 0);
          const aRep = reportByMainId.get(aid);
          const aIncome = aRep
            ? Number((Number(aRep.direct30TotalUsdt || 0) + Number(aRep.level30TotalUsdt || 0)).toFixed(2))
            : 0;
          autoMap.set(aid, {
            id: aid,
            rank: Number(au.rank || 1),
            spawnedByMainId: Number(au.spawnedByMainId || targetId),
            parentId: Number(au.parentId || 0),
            side: String(au.side || ''),
            owner: String(au.owner || aRep?.owner || mainRep.owner || ''),
            currentMaxRank: Number(aRep?.currentMaxRank || 1),
            incomeUsdt: aIncome,
            vaultRemainingUsdt: Number(aRep?.vault35RemainingTotalUsdt || 0),
          });
        }
        // If Main #targetId itself is an Auto ID, also list it in Auto IDs tab
        if (mainRep.isAutoId) {
          autoMap.set(targetId, {
            id: targetId,
            rank: 1,
            spawnedByMainId: Number(mainRep.directSponsorNodeId || 1),
            parentId: 0,
            side: '',
            owner: String(mainRep.owner || ''),
            currentMaxRank: Number(mainRep.currentMaxRank || 1),
            incomeUsdt: Number(
              (Number(mainRep.direct30TotalUsdt || 0) + Number(mainRep.level30TotalUsdt || 0)).toFixed(2)
            ),
            vaultRemainingUsdt: Number(mainRep.vault35RemainingTotalUsdt || 0),
          });
        }
      }

      // 2) Also check if targetId matches any Clone / Extra / Auto node ID spawned under another Main ID
      for (const r of allReports) {
        if (r.isClone || r.isExtraId) continue;
        const parentMainId = Number(r.id || 0);
        for (const c of r.clonesSpawned || []) {
          if (Number(c.id) === targetId) {
            const cr = Number(c.rank || 1);
            const key = `${cr}-${targetId}`;
            if (!cloneMap.has(key)) {
              const d30 = Number(c.direct30TotalUsdt || 0);
              const l30 = Number(c.level30TotalUsdt || 0);
              cloneMap.set(key, {
                id: targetId,
                rank: cr,
                originMainId: parentMainId,
                cloneSequence: Number(c.cloneSequence || 1),
                cloneRound: Number(c.cloneRound || 1),
                parentId: Number(c.parentId || 0),
                side: String(c.side || ''),
                owner: String(c.owner || r.owner || ''),
                direct30Usdt: d30,
                level30Usdt: l30,
                incomeUsdt: Number((d30 + l30).toFixed(2)),
                vault35Usdt: Number(c.vault35GrossTotalUsdt || 0),
              });
            }
          }
        }
        for (const ex of r.autoExtraIdsSpawned || []) {
          if (Number(ex.id) === targetId) {
            const er = Number(ex.rank || 4);
            const key = `${er}-${targetId}`;
            if (!extraMap.has(key)) {
              const d30 = Number(ex.direct30TotalUsdt || 0);
              const l30 = Number(ex.level30TotalUsdt || 0);
              extraMap.set(key, {
                id: targetId,
                rank: er,
                originMainId: parentMainId,
                parentId: Number(ex.parentId || 0),
                side: String(ex.side || ''),
                owner: String(ex.owner || r.owner || ''),
                direct30Usdt: d30,
                level30Usdt: l30,
                incomeUsdt: Number((d30 + l30).toFixed(2)),
                vault35Usdt: Number(ex.vault35GrossTotalUsdt || 0),
              });
            }
          }
        }
      }

      // 3) All matching nodes in current Matrix Rank (node id === targetId or originMainId === targetId)
      const matchedNodesInCurrentRank = nodes.filter(
        (n) =>
          Number(n.id) === targetId ||
          Number(n.originMainId) === targetId ||
          Number(n.autoSourceMainId) === targetId
      );
      for (const n of matchedNodesInCurrentRank) {
        if (isCloneNode(n)) {
          const key = `${matrixRank}-${n.id}`;
          if (!cloneMap.has(key)) {
            cloneMap.set(key, {
              id: Number(n.id),
              rank: matrixRank,
              originMainId: getMainId(n),
              cloneSequence: cloneSeqByNodeId.get(Number(n.id)) || Number(n.cloneSequence || 1),
              cloneRound: Number(n.cloneRound || 1),
              parentId: Number(n.parentId || 0),
              side: n.parentId > 0 ? (n.isLeft ? 'LEFT' : 'RIGHT') : 'ROOT',
              owner: String(n.owner || ''),
              direct30Usdt: 0,
              level30Usdt: 0,
              incomeUsdt: 0,
              vault35Usdt: 0,
            });
          }
        } else if (isExtraNode(n)) {
          const key = `${matrixRank}-${n.id}`;
          if (!extraMap.has(key)) {
            extraMap.set(key, {
              id: Number(n.id),
              rank: matrixRank,
              originMainId: getMainId(n),
              parentId: Number(n.parentId || 0),
              side: n.parentId > 0 ? (n.isLeft ? 'LEFT' : 'RIGHT') : 'ROOT',
              owner: String(n.owner || ''),
              direct30Usdt: 0,
              level30Usdt: 0,
              incomeUsdt: 0,
              vault35Usdt: 0,
            });
          }
        } else if (isAutoNode(n) && !autoMap.has(Number(n.id))) {
          const aRep = reportByMainId.get(Number(n.id));
          autoMap.set(Number(n.id), {
            id: Number(n.id),
            rank: matrixRank,
            spawnedByMainId: Number(n.autoSourceMainId || n.directSponsorNodeId || 1),
            parentId: Number(n.parentId || 0),
            side: n.parentId > 0 ? (n.isLeft ? 'LEFT' : 'RIGHT') : 'ROOT',
            owner: String(n.owner || ''),
            currentMaxRank: Number(aRep?.currentMaxRank || 1),
            incomeUsdt: aRep
              ? Number((Number(aRep.direct30TotalUsdt || 0) + Number(aRep.level30TotalUsdt || 0)).toFixed(2))
              : 0,
            vaultRemainingUsdt: Number(aRep?.vault35RemainingTotalUsdt || 0),
          });
        }
      }

      const cloneHits = Array.from(cloneMap.values()).sort((a, b) => a.rank - b.rank || a.id - b.id);
      const extraHits = Array.from(extraMap.values()).sort((a, b) => a.rank - b.rank || a.id - b.id);
      const autoHits = Array.from(autoMap.values()).sort((a, b) => a.id - b.id);
      const matches = matchedNodesInCurrentRank.map((n) => ({
        node: n,
        layerInSubtree: subtreeDepthMap.get(Number(n.id))?.layer,
        layerFromGlobal: globalDepthMap.get(Number(n.id)),
      }));

      const totalFound =
        mainHits.length + cloneHits.length + extraHits.length + autoHits.length + matches.length;

      if (totalFound === 0) {
        setSearchResult({
          query: raw,
          layerJumpHint: layerHint,
          message: `ไม่พบข้อมูลของ ID #${targetId} ทั้งข้อมูลหลัก โคลน Extra ID และ Auto ID`,
          isError: true,
        });
        return;
      }

      setSearchResult({
        query: raw,
        layerJumpHint: layerHint,
        message: `พบข้อมูลทั้งหมดของ ID #${targetId}: หลัก ${mainHits.length} · โคลน ${cloneHits.length} · Extra ${extraHits.length} · Auto ${autoHits.length} · ในผัง R${matrixRank} (${matches.length})`,
        mainHits,
        cloneHits,
        extraHits,
        autoHits,
        matches,
      });
      return;
    }

    // Text / Wallet search across all reports (Main, Clone, Extra, Auto) AND current Matrix nodes
    const q = raw.toLowerCase();
    const matchedReports = allReports.filter((r) => {
      if (r.isClone || r.isExtraId) return false;
      const hay = [
        `#${r.id}`,
        String(r.id),
        r.label || '',
        r.owner || '',
        r.isAutoId ? 'auto' : 'main',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });

    const cloneHits: NonNullable<typeof searchResult>['cloneHits'] = [];
    const extraHits: NonNullable<typeof searchResult>['extraHits'] = [];
    const autoHits: NonNullable<typeof searchResult>['autoHits'] = [];

    for (const r of matchedReports) {
      const mId = Number(r.id);
      for (const c of r.clonesSpawned || []) {
        const d30 = Number(c.direct30TotalUsdt || 0);
        const l30 = Number(c.level30TotalUsdt || 0);
        cloneHits.push({
          id: Number(c.id),
          rank: Number(c.rank || 1),
          originMainId: mId,
          cloneSequence: Number(c.cloneSequence || 1),
          cloneRound: Number(c.cloneRound || 1),
          parentId: Number(c.parentId || 0),
          side: String(c.side || ''),
          owner: String(c.owner || r.owner || ''),
          direct30Usdt: d30,
          level30Usdt: l30,
          incomeUsdt: Number((d30 + l30).toFixed(2)),
          vault35Usdt: Number(c.vault35GrossTotalUsdt || 0),
        });
      }
      for (const ex of r.autoExtraIdsSpawned || []) {
        const d30 = Number(ex.direct30TotalUsdt || 0);
        const l30 = Number(ex.level30TotalUsdt || 0);
        extraHits.push({
          id: Number(ex.id),
          rank: Number(ex.rank || 4),
          originMainId: mId,
          parentId: Number(ex.parentId || 0),
          side: String(ex.side || ''),
          owner: String(ex.owner || r.owner || ''),
          direct30Usdt: d30,
          level30Usdt: l30,
          incomeUsdt: Number((d30 + l30).toFixed(2)),
          vault35Usdt: Number(ex.vault35GrossTotalUsdt || 0),
        });
      }
      for (const au of r.autoIdsSpawned || []) {
        const aid = Number(au.id);
        const aRep = reportByMainId.get(aid);
        autoHits.push({
          id: aid,
          rank: Number(au.rank || 1),
          spawnedByMainId: Number(au.spawnedByMainId || mId),
          parentId: Number(au.parentId || 0),
          side: String(au.side || ''),
          owner: String(au.owner || aRep?.owner || r.owner || ''),
          currentMaxRank: Number(aRep?.currentMaxRank || 1),
          incomeUsdt: aRep
            ? Number((Number(aRep.direct30TotalUsdt || 0) + Number(aRep.level30TotalUsdt || 0)).toFixed(2))
            : 0,
          vaultRemainingUsdt: Number(aRep?.vault35RemainingTotalUsdt || 0),
        });
      }
    }

    const matched = nodes.filter((n) => {
      const hay = [
        `#${n.id}`,
        String(n.id),
        n.owner || '',
        getNodeTypeLabel(n),
        n.originMainId ? `#${n.originMainId}` : '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });

    if (
      matchedReports.length === 0 &&
      cloneHits.length === 0 &&
      extraHits.length === 0 &&
      autoHits.length === 0 &&
      matched.length === 0
    ) {
      setSearchResult({
        query: raw,
        message: `ไม่พบสมาชิกหรือตำแหน่งที่ตรงกับ "${raw}"`,
        isError: true,
      });
      return;
    }

    setSearchResult({
      query: raw,
      message: `ผลค้นหา "${raw}": หลัก ${matchedReports.length} · โคลน ${cloneHits.length} · Extra ${extraHits.length} · Auto ${autoHits.length} · ในผัง R${matrixRank} (${matched.length})`,
      mainHits: matchedReports.slice(0, 20),
      cloneHits: cloneHits.slice(0, 30),
      extraHits: extraHits.slice(0, 30),
      autoHits: autoHits.slice(0, 30),
      matches: matched.slice(0, 24).map((n) => ({
        node: n,
        layerInSubtree: subtreeDepthMap.get(Number(n.id))?.layer,
        layerFromGlobal: globalDepthMap.get(Number(n.id)),
      })),
    });
  };

  return (
    <div className="space-y-3.5">
      {/* HEADER BAR MATCHING MATRIX 15 LAYERS TEMPLATE */}
      <section className="mx-1 p-4 sm:p-5 text-white rounded-[24px] bg-[radial-gradient(ellipse_at_85%_90%,rgba(71,225,255,0.42),transparent_40%),linear-gradient(120deg,#031c5c,#075ed0_65%,#031d61)] shadow-[0_8px_24px_rgba(0,60,155,0.4)] border border-[#42bfff]/60">
        <div className="flex items-center justify-between gap-2.5 flex-wrap">
          <div className="min-w-0">
            <FractalFlowBrandCard size="md" />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="px-2.5 py-1 rounded-full bg-[#ffdf6d] text-[#09265f] text-[11px] font-black whitespace-nowrap">
              ผัง MATRIX 15 ชั้น · Rank {matrixRank}
            </span>
            <span className="px-3 py-1.5 rounded-full bg-white/15 border border-[#9eeaff] text-xs font-bold whitespace-nowrap">
              👤 {activeIdSummary ? `${activeIdSummary.label} (R${idEffectiveRank})` : `ID #${displayId} (R${idEffectiveRank})`}
              {!isSelectedRankUnlockedForId && ' · 🔒 ยังไม่ปลดล็อก R' + matrixRank}
            </span>
            {activeIdSummary?.isSubId && onBackToMainId && (
              <button
                type="button"
                onClick={onBackToMainId}
                className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-cyan-200/60 text-white text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                ← กลับ Main #{activeIdSummary.mainId}
              </button>
            )}
            {onOpenSwitchId && (
              <button
                type="button"
                onClick={onOpenSwitchId}
                className="px-2.5 py-1.5 rounded-xl bg-gradient-to-br from-[#23caff] to-[#0755d7] hover:brightness-110 border border-[#7ce5ff]/70 text-white text-[11px] font-black inline-flex items-center gap-1 whitespace-nowrap cursor-pointer shadow-sm transition-transform duration-150"
              >
                ⇄ สลับบัญชี
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsSearchModalOpen(true)}
              className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-cyan-200/60 text-white text-[11px] font-black inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" /> ค้นหา ID
            </button>
            <button
              type="button"
              onClick={fetchRankNodes}
              className="p-2 rounded-xl bg-white/15 hover:bg-white/25 border border-cyan-300/40 text-white cursor-pointer"
              title="รีเฟรชข้อมูลผัง"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => onOpenFullMatrixCanvas(matrixRank)}
              className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-cyan-300/40 text-[11px] font-bold text-white inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              ผังกราฟเต็มจอ <ExternalLink className="w-3 h-3" />
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

        {/* RANK 1–18 SWITCHER (PER-ID RANK STATUS) */}
        <div className="mt-3 pt-3 border-t border-white/15">
          <div className="flex items-center justify-between gap-2 flex-wrap text-[10.5px] text-cyan-100 mb-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold">
                สถานะ Rank ของ {activeIdSummary?.label || `ID #${displayId}`}:
              </span>
              <span className="text-[10px] text-cyan-200/90">
                ★ Rank ปัจจุบัน (R{idEffectiveRank}) · ✓ ปลดล็อกแล้ว · 🔒 ยังไม่ถึง
              </span>
            </div>
            <span className="font-mono">
              R{matrixRank}: ทั้งระบบ {nodes.length} รหัส
              {isSelectedRankUnlockedForId && activeIdSummary
                ? ` · ใต้ ID นี้ ${activeIdSummary.idMembersCountByRank?.[matrixRank] ?? 0} รหัส`
                : ''}
            </span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {Array.from({ length: 18 }, (_, i) => i + 1).map((r) => {
              const active = matrixRank === r;
              const unlocked = isIdUnlockedInRank(r);
              const isCurrentOfId = r === idEffectiveRank;
              const idRankCnt = activeIdSummary?.idMembersCountByRank?.[r];
              const sysCnt = Number(rankCounts[r] ?? (r === matrixRank ? nodes.length : 0));
              const displayCnt =
                idRankCnt !== undefined
                  ? idRankCnt
                  : r === matrixRank &&
                    activeIdNodeInCurrentRank &&
                    effectiveRootId === Number(activeIdNodeInCurrentRank.id)
                  ? Math.max(0, totalSubtreeCount - 1)
                  : undefined;

              return (
                <button
                  key={`m-rank-${r}`}
                  type="button"
                  onClick={() => {
                    setMatrixRank(r);
                    setFocusedRootId(null);
                    setSelectedLayer(0);
                    setSearchResult(null);
                  }}
                  title={
                    isCurrentOfId
                      ? `Rank ปัจจุบันของ ${activeIdSummary?.label || `ID #${displayId}`}`
                      : unlocked
                      ? `ปลดล็อกแล้วสำหรับ ${activeIdSummary?.label || `ID #${displayId}`}`
                      : `ยังไม่ปลดล็อก Rank ${r} (ในระบบมี ${sysCnt} รหัส — กดเพื่อดูผังรวม)`
                  }
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap shrink-0 border transition-transform duration-150 cursor-pointer inline-flex items-center gap-1 ${
                    active
                      ? unlocked
                        ? 'bg-[#ffdf6d] text-[#0b2a66] border-[#fff1a8] shadow-sm'
                        : 'bg-amber-200/90 text-[#0b2a66] border-amber-300 shadow-sm'
                      : isCurrentOfId
                      ? 'bg-emerald-400/25 text-white border-emerald-300/80 hover:bg-emerald-400/35'
                      : unlocked
                      ? 'bg-cyan-400/20 text-white border-cyan-200/60 hover:bg-cyan-400/30'
                      : 'bg-slate-900/40 text-cyan-100/50 border-white/15 hover:bg-slate-900/55 hover:text-cyan-100/80'
                  }`}
                >
                  <span className="text-[10px] leading-none">
                    {isCurrentOfId ? '★' : unlocked ? '✓' : '🔒'}
                  </span>
                  <span>R{r}</span>
                  {unlocked && displayCnt !== undefined ? (
                    <span className="opacity-85 font-mono">({displayCnt})</span>
                  ) : !unlocked ? (
                    <span className="text-[9.5px] opacity-75">ล็อก</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {loadError && (
        <div className="mx-1 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
          {loadError}
        </div>
      )}

      {/* SELECTED ID STATUS & LIVE INFO CARD */}
      {activeIdSummary && (
        <section className="mx-1 p-3.5 sm:p-4 rounded-[21px] bg-gradient-to-br from-white to-[#e3f4ff] border border-[#9fd6ff] shadow-[0_6px_18px_rgba(7,85,181,0.14)] space-y-3">
          <div className="flex items-start sm:items-center justify-between gap-2.5 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black text-white ${
                  activeIdSummary.typeBadge === 'CLONE ID'
                    ? 'bg-emerald-600'
                    : activeIdSummary.typeBadge === 'EXTRA ID'
                    ? 'bg-violet-600'
                    : activeIdSummary.typeBadge === 'AUTO ID'
                    ? 'bg-amber-600'
                    : 'bg-[#0758d4]'
                }`}
              >
                {activeIdSummary.typeBadge}
              </span>
              <strong className="text-[14px] sm:text-[16px] font-black text-[#09265f]">
                {activeIdSummary.label}
              </strong>
              <span className="px-2 py-0.5 rounded-full bg-[#ffdf6d] text-[#09265f] text-[10.5px] font-black">
                {activeIdSummary.isSubId
                  ? `อยู่ Rank ${idEffectiveRank}`
                  : `Rank ปัจจุบัน: R${idEffectiveRank} / 18`}
              </span>
              {isSelectedRankUnlockedForId ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 text-[10.5px] font-extrabold">
                  {activeIdNodeInCurrentRank
                    ? `✓ อยู่ในผัง R${matrixRank} (Node #${activeIdNodeInCurrentRank.id})`
                    : `✓ ปลดล็อก R${matrixRank} แล้ว`}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-[10.5px] font-extrabold">
                  🔒 ยังไม่ปลดล็อก R{matrixRank} (แสดงผังอ้างอิงจาก ROOT #{effectiveRootId})
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {(matrixRank !== idEffectiveRank ||
                (activeIdNodeInCurrentRank &&
                  effectiveRootId !== Number(activeIdNodeInCurrentRank.id))) && (
                <button
                  type="button"
                  onClick={() => {
                    setMatrixRank(idEffectiveRank);
                    setFocusedRootId(
                      activeIdSummary.isSubId && activeIdSummary.subNodeId
                        ? activeIdSummary.subNodeId
                        : null
                    );
                    setSelectedLayer(0);
                    setSearchResult(null);
                  }}
                  className="px-2.5 py-1 rounded-xl bg-[#087cf4] hover:bg-[#0568d0] text-white text-[11px] font-bold cursor-pointer shadow-xs whitespace-nowrap"
                >
                  ← กลับผัง R{idEffectiveRank} ของ ID นี้
                </button>
              )}
              {!isSelectedRankUnlockedForId && !activeIdSummary.isSubId && onOpenUpgradeModal && (
                <button
                  type="button"
                  onClick={onOpenUpgradeModal}
                  className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer shadow-xs whitespace-nowrap"
                >
                  📈 อัปเกรด Rank
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="p-2.5 rounded-[14px] bg-white border border-[#bde2ff]">
              <small className="block text-[10px] font-bold text-[#5a78a1]">ข้อมูล ID & ผู้แนะนำ</small>
              <div className="text-[12px] sm:text-[13px] font-black text-[#09265f] mt-0.5 truncate">
                {activeIdSummary.isSubId
                  ? `จาก Main #${activeIdSummary.mainId}`
                  : `ปลดล็อก R1–R${idEffectiveRank}`}{' '}
                · แนะนำ #{activeIdSummary.directSponsorNodeId}
              </div>
              <div className="text-[10px] font-mono text-[#4f7097] truncate">
                {shortAddr(activeIdSummary.owner)}
                {activeIdSummary.subKind === 'CLONE' && activeIdSummary.cloneSequence
                  ? ` · ครั้งที่ ${activeIdSummary.cloneSequence}`
                  : !activeIdSummary.isSubId
                  ? ` · โคลน ${activeIdSummary.totalClonesCount} · Auto ${activeIdSummary.totalAutoIdCount} · Extra ${activeIdSummary.totalExtraIdCount}`
                  : ''}
              </div>
            </div>

            <div className="p-2.5 rounded-[14px] bg-white border border-[#bde2ff]">
              <small className="block text-[10px] font-bold text-[#5a78a1]">
                สมาชิกใต้ ID นี้ (R{matrixRank})
              </small>
              <div className="text-[13px] sm:text-[15px] font-black font-mono text-[#0758d4] mt-0.5">
                {isSelectedRankUnlockedForId
                  ? `${fmtNum(
                      activeIdSummary.idMembersCountByRank?.[matrixRank] ??
                        (activeIdNodeInCurrentRank ? Math.max(0, totalSubtreeCount - 1) : 0)
                    )} รหัส`
                  : '🔒 ยังไม่ปลดล็อก'}
              </div>
              <div className="text-[10px] font-bold text-[#4f7097] truncate">
                รวมทุก Rank ใต้ ID นี้: {fmtNum(activeIdSummary.totalMembersAllRanks)} รหัส
              </div>
            </div>

            <div className="p-2.5 rounded-[14px] bg-white border border-[#bde2ff]">
              <small className="block text-[10px] font-bold text-[#5a78a1]">รายได้รวมของ ID นี้</small>
              <div className="text-[13px] sm:text-[15px] font-black font-mono text-emerald-700 mt-0.5">
                {activeIdSummary.totalIncomeUsdt.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                USDT
              </div>
              <div className="text-[10px] font-bold text-[#4f7097] truncate">
                แนะนำ {activeIdSummary.direct30TotalUsdt.toFixed(1)} + ชั้น {activeIdSummary.level30TotalUsdt.toFixed(1)}
              </div>
            </div>

            <div className="p-2.5 rounded-[14px] bg-white border border-[#bde2ff]">
              <small className="block text-[10px] font-bold text-[#5a78a1]">
                {activeIdSummary.isSubId ? '35% Vault ที่สร้างได้' : 'Vault คงเหลือของ ID นี้'}
              </small>
              <div className="text-[13px] sm:text-[15px] font-black font-mono text-[#09265f] mt-0.5">
                {activeIdSummary.vaultRemainingUsdt.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                USDT
              </div>
              <div className="text-[10px] font-bold text-[#4f7097] truncate">
                {activeIdSummary.isSubId
                  ? `โอนเข้าถัง Main #${activeIdSummary.mainId}`
                  : 'รวม Upgrade + Auto + Extra'}
              </div>
            </div>
          </div>
        </section>
      )}

      {!activeIdSummary && !activeIdNodeInCurrentRank && nodes.length > 0 && effectiveRootId !== displayId && (
        <div className="mx-1 px-3.5 py-2.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
          ID #{displayId} ยังไม่ได้ปลดล็อก Rank {matrixRank} — แสดงผังเริ่มต้นจาก ROOT #{effectiveRootId}
        </div>
      )}

      {/* 1. SUMMARY METRICS STRIP */}
      <section className="mx-1 p-4 rounded-[21px] bg-white/90 border border-[#b8e1ff] shadow-[0_8px_22px_rgba(7,85,181,0.17)]">
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2.5 sm:p-3 rounded-[15px] bg-gradient-to-br from-white to-[#d9f1ff] border border-[#b5ddff]">
            <small className="block text-[10px] font-bold text-[#5a78a1]">ชั้นที่เลือก</small>
            <b className="text-[17px] sm:text-[20px] font-black font-mono tabular-nums text-[#09275f] block mt-0.5">
              {selectedLayer} / 15
            </b>
          </div>
          <div className="p-2.5 sm:p-3 rounded-[15px] bg-gradient-to-br from-white to-[#d9f1ff] border border-[#b5ddff]">
            <small className="block text-[10px] font-bold text-[#5a78a1]">
              ตำแหน่งสูงสุดในชั้น*
            </small>
            <b className="text-[17px] sm:text-[20px] font-black font-mono tabular-nums text-[#09275f] block mt-0.5">
              {fmtNum(theoreticalCapacity)}
            </b>
          </div>
          <div className="p-2.5 sm:p-3 rounded-[15px] bg-gradient-to-br from-white to-[#d9f1ff] border border-[#b5ddff]">
            <small className="block text-[10px] font-bold text-[#5a78a1]">สมาชิกที่พบจริง</small>
            <b className="text-[17px] sm:text-[20px] font-black font-mono tabular-nums text-[#0758d4] block mt-0.5">
              {fmtNum(currentLayerEntries.length)}
            </b>
          </div>
        </div>
        <p className="text-[11px] text-[#58769d] leading-relaxed mt-2.5">
          *จำนวนตำแหน่งเป็นการคำนวณตามโครงสร้าง Binary Tree ทางทฤษฎี (ชั้นที่ n มี 2^n ตำแหน่ง โดยชั้น 0 คือ Root) · ใต้{' '}
          <strong className="text-[#0754b9]">ID #{effectiveRootId}</strong> ใน Rank {matrixRank}{' '}
          พบสมาชิกสะสมชั้น 0–15 รวม <strong className="font-mono">{totalSubtreeCount}</strong> รหัส
        </p>
      </section>

      {/* 2. COMPACT SEARCH POPUP TRIGGER BAR */}
      <section className="mx-1 p-3 sm:p-3.5 rounded-[20px] bg-white/95 border border-[#b8e1ff] shadow-[0_6px_18px_rgba(7,85,181,0.14)]">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-[#e6f5ff] border border-[#b5ddff] text-[#087cf4] flex items-center justify-center shrink-0">
              <Search className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[13.5px] sm:text-[15px] font-black text-[#09275f] leading-tight">
                ค้นหาข้อมูล ID · โคลน · Extra ID · Auto ID
              </h3>
              <p className="text-[10.5px] font-semibold text-[#5a78a1] truncate">
                กรอกเลข ID (เช่น 3), Wallet หรือชั้น — เปิดดูในหน้าต่างป๊อปอัพครบทุกไอดี
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
              {searchResult && searchResult.query
                ? `เปิดผลค้นหา "${searchResult.query}"`
                : 'เปิดหน้าต่างค้นหา'}
            </span>
          </button>
        </div>
      </section>

      {/* 3. MATRIX VISUAL TREE + LAYER FOCUS */}
      <section className="mx-1 p-4 rounded-[21px] bg-white/90 border border-[#b8e1ff] shadow-[0_8px_22px_rgba(7,85,181,0.17)]">
        <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[15px] sm:text-[16px] font-black text-[#09275f]">
              🌐 โครงสร้าง Matrix (Rank {matrixRank})
            </h3>
            {onOpenSwitchId && (
              <button
                type="button"
                onClick={onOpenSwitchId}
                className="px-2.5 py-1 rounded-xl bg-gradient-to-br from-[#23caff] to-[#0755d7] text-white text-[11px] font-black shadow-xs hover:brightness-105 transition-transform duration-150 cursor-pointer whitespace-nowrap"
              >
                ⇄ สลับบัญชี
              </button>
            )}
          </div>
          <small className="text-[10.5px] font-semibold text-[#5a78a1]">
            เลือก Rank หรือชั้นเพื่อดูตำแหน่งจริง
          </small>
        </div>

        {/* RANK 1–18 DROP DOWN SELECTOR */}
        <div ref={rankDropdownRef} className="relative mb-3 pb-2.5 border-b border-[#d5ebff]">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[11px] font-bold text-[#45668f]">
              เลือก Rank ที่ต้องการดู ({activeIdSummary?.label || `ID #${displayId}`}):
            </div>
            <div className="text-[10px] font-semibold text-[#5a78a1]">
              ★ ปัจจุบัน · ✓ ปลดล็อกแล้ว · 🔒 ยังไม่ถึง
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsRankDropdownOpen((prev) => !prev)}
            className={`mt-1.5 w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-[14px] border text-left cursor-pointer shadow-xs transition-transform duration-150 ${
              isSelectedRankUnlockedForId
                ? 'bg-gradient-to-r from-[#eff8ff] to-[#dff1ff] border-[#7cc4ff] text-[#09275f]'
                : 'bg-amber-50 border-amber-300 text-amber-950'
            }`}
            aria-expanded={isRankDropdownOpen}
          >
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span
                className={`px-2 py-0.5 rounded-lg text-[11px] font-black ${
                  matrixRank === idEffectiveRank
                    ? 'bg-emerald-600 text-white'
                    : isSelectedRankUnlockedForId
                    ? 'bg-[#087cf4] text-white'
                    : 'bg-amber-500 text-white'
                }`}
              >
                {matrixRank === idEffectiveRank
                  ? `★ Rank ${matrixRank}`
                  : isSelectedRankUnlockedForId
                  ? `✓ Rank ${matrixRank}`
                  : `🔒 Rank ${matrixRank}`}
              </span>
              <span className="text-xs font-extrabold truncate">
                {matrixRank === idEffectiveRank
                  ? 'Rank ปัจจุบันของ ID นี้'
                  : isSelectedRankUnlockedForId
                  ? 'ปลดล็อกแล้ว'
                  : 'ยังไม่ปลดล็อก (ดูผังรวม)'}
              </span>
              <span className="text-[11px] font-mono font-bold text-[#0754b9]">
                {isSelectedRankUnlockedForId
                  ? `· ใต้ ID นี้ ${fmtNum(
                      activeIdSummary?.idMembersCountByRank?.[matrixRank] ??
                        (activeIdNodeInCurrentRank &&
                        effectiveRootId === Number(activeIdNodeInCurrentRank.id)
                          ? Math.max(0, totalSubtreeCount - 1)
                          : 0)
                    )} รหัส`
                  : `· ทั้งระบบ ${fmtNum(Number(rankCounts[matrixRank] ?? nodes.length))} รหัส`}
              </span>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-[#0754b9] shrink-0 transition-transform duration-150 ${
                isRankDropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {isRankDropdownOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-[16px] bg-white border-2 border-[#8ecbff] shadow-[0_14px_34px_rgba(7,85,181,0.28)] overflow-hidden">
              <div className="px-3 py-2 bg-[#eff8ff] border-b border-[#cbe7ff] flex items-center justify-between text-[10.5px] font-bold text-[#0754b9]">
                <span>เลือก Rank 1–18 ({activeIdSummary?.label || `ID #${displayId}`})</span>
                <span>แตะเพื่อเปลี่ยน Rank</span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-[#eaf5ff] p-1.5 space-y-1">
                {Array.from({ length: 18 }, (_, i) => i + 1).map((r) => {
                  const active = matrixRank === r;
                  const unlocked = isIdUnlockedInRank(r);
                  const isCurrentOfId = r === idEffectiveRank;
                  const idRankCnt = activeIdSummary?.idMembersCountByRank?.[r];
                  const sysCnt = Number(rankCounts[r] ?? (r === matrixRank ? nodes.length : 0));
                  const displayCnt =
                    idRankCnt !== undefined
                      ? idRankCnt
                      : r === matrixRank &&
                        activeIdNodeInCurrentRank &&
                        effectiveRootId === Number(activeIdNodeInCurrentRank.id)
                      ? Math.max(0, totalSubtreeCount - 1)
                      : undefined;

                  return (
                    <button
                      key={`dd-rank-${r}`}
                      type="button"
                      onClick={() => {
                        setMatrixRank(r);
                        setFocusedRootId(null);
                        setSelectedLayer(0);
                        setSearchResult(null);
                        setIsRankDropdownOpen(false);
                      }}
                      className={`w-full px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-left text-xs cursor-pointer transition-transform duration-150 ${
                        active
                          ? 'bg-gradient-to-r from-[#087cf4] to-[#0648b2] text-white shadow-xs'
                          : unlocked
                          ? 'bg-[#f5fbff] hover:bg-[#e2f2ff] text-[#09265f]'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-500'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs leading-none">
                          {isCurrentOfId ? '★' : unlocked ? '✓' : '🔒'}
                        </span>
                        <strong className="font-mono font-black">Rank {r}</strong>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9.5px] font-extrabold ${
                            active
                              ? 'bg-white/20 text-white'
                              : isCurrentOfId
                              ? 'bg-emerald-100 text-emerald-800'
                              : unlocked
                              ? 'bg-cyan-100 text-[#0754b9]'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {isCurrentOfId
                            ? 'Rank ปัจจุบัน'
                            : unlocked
                            ? 'ปลดล็อกแล้ว'
                            : 'ยังไม่ปลดล็อก'}
                        </span>
                      </div>
                      <span
                        className={`text-[11px] font-mono font-bold whitespace-nowrap ${
                          active ? 'text-cyan-100' : unlocked ? 'text-[#0754b9]' : 'text-slate-400'
                        }`}
                      >
                        {unlocked && displayCnt !== undefined
                          ? `ใต้ ID ${fmtNum(displayCnt)} รหัส`
                          : `ระบบ ${fmtNum(sysCnt)} รหัส`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Quick 0..15 Layer Chips */}
        <div className="flex gap-1.5 flex-wrap">
          {Array.from({ length: 16 }, (_, idx) => idx).map((n) => {
            const active = selectedLayer === n;
            const cnt = (layersMap[n] || []).length;
            return (
              <button
                key={`ql-${n}`}
                type="button"
                onClick={() => chooseLayer(n)}
                className={`px-2.5 py-1.5 rounded-[12px] text-[11px] font-bold border transition cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-gradient-to-r from-[#22caff] to-[#0758d4] text-white border-[#25caff] shadow-sm'
                    : cnt > 0
                    ? 'bg-[#eff9ff] text-[#0753ae] border-[#9fcfff] hover:bg-[#dff3ff]'
                    : 'bg-[#f7fbff] text-[#6d8aad] border-[#d3e9ff] hover:bg-[#eff9ff]'
                }`}
              >
                ชั้น {n}
                {cnt > 0 && <span className="ml-1 font-mono opacity-85">({cnt})</span>}
              </button>
            );
          })}
        </div>

        {/* Legend (7 Spherical Orb Categories + Empty) */}
        <div className="flex gap-2 flex-wrap text-[10px] font-bold text-[#35567e] mt-3">
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#f5f9fe] border border-[#cde3f8]">
            <i className="inline-block w-4 h-4 rounded-full bg-[radial-gradient(circle_at_30%_24%,#ffffff_0%,#eef6fc_28%,#c3d9eb_58%,#66849f_100%)] border border-[#9cbcd6]/80 shadow-[0_0_5px_rgba(115,175,230,0.28)]" />
            เจ้าของผัง / สายเลือดใต้เจ้าของผัง
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#f5f9fe] border border-[#cde3f8]">
            <i className="inline-block w-4 h-4 rounded-full bg-[radial-gradient(circle_at_30%_24%,#ffffff_0%,#eef9f3_28%,#c1e2d0_58%,#55866d_100%)] border border-[#8fc4a9]/80 shadow-[0_0_5px_rgba(80,210,145,0.28)]" />
            Clone ID (เจ้าของผัง)
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#f5f9fe] border border-[#cde3f8]">
            <i className="inline-block w-4 h-4 rounded-full bg-[radial-gradient(circle_at_30%_24%,#ffffff_0%,#f8f5ea_28%,#e3dec3_58%,#8d8356_100%)] border border-[#cfc698]/80 shadow-[0_0_5px_rgba(220,200,115,0.28)]" />
            Auto ID (เจ้าของผัง)
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#f5f9fe] border border-[#cde3f8]">
            <i className="inline-block w-4 h-4 rounded-full bg-[radial-gradient(circle_at_30%_24%,#ffffff_0%,#faf0f2_28%,#e2c1c7_58%,#8f5661_100%)] border border-[#d4a5ae]/80 shadow-[0_0_5px_rgba(220,125,145,0.28)]" />
            Extra ID (เจ้าของผัง)
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#f5f9fe] border border-[#cde3f8]">
            <i className="inline-block w-4 h-4 rounded-full bg-[radial-gradient(circle_at_30%_24%,#ffffff_0%,#ebd6ff_26%,#c58aff_56%,#7022c4_100%)] border border-[#d8b4fe]/85 shadow-[0_0_5px_rgba(168,85,247,0.28)]" />
            เฉพาะรหัส #1 / โคลน #1
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#f5f9fe] border border-[#cde3f8]">
            <i className="inline-block w-4 h-4 rounded-full bg-[radial-gradient(circle_at_30%_24%,#eef8ff_0%,#8ad0ff_26%,#3da3f5_56%,#0f4e99_100%)] border border-[#8ad0ff]/80 shadow-[0_0_5px_rgba(56,178,255,0.28)]" />
            โคลนนิ่งอัพไลน์ในสายเลือด
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#f5f9fe] border border-[#cde3f8]">
            <i className="inline-block w-4 h-4 rounded-full bg-[radial-gradient(circle_at_30%_24%,#fff8c2_0%,#fbd966_28%,#e3ab25_58%,#8d5905_100%)] border border-[#f2c95c]/80 shadow-[0_0_5px_rgba(245,180,35,0.28)]" />
            รหัสที่ไม่ได้อยู่ในสายเลือด
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#f5f9fe] border border-[#cde3f8]">
            <i className="inline-block w-4 h-4 rounded-full bg-[#f4f8fd] border-2 border-dashed border-[#8fb6db]" />
            ว่าง / รอสมาชิก
          </span>
        </div>

        {/* Up/Reset & Auto-Size Navigation */}
        <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {rootNode && rootNode.parentId > 0 && nodeMap.has(Number(rootNode.parentId)) && (
              <button
                type="button"
                onClick={() => focusNodeAsRoot(Number(rootNode.parentId))}
                className="px-2.5 py-1 rounded-lg bg-[#eff8ff] border border-[#a5d6ff] text-[11px] font-bold text-[#0754b9] inline-flex items-center gap-1 cursor-pointer"
              >
                <ArrowUp className="w-3 h-3" /> ขึ้นไปอัพไลน์ #{rootNode.parentId}
              </button>
            )}
            {effectiveRootId !== defaultRootId && (
              <button
                type="button"
                onClick={() => focusNodeAsRoot(defaultRootId)}
                className="px-2.5 py-1 rounded-lg bg-white border border-[#a5d6ff] text-[11px] font-bold text-[#0754b9] cursor-pointer"
              >
                ↺ กลับไป ROOT #{defaultRootId}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              type="button"
              onClick={() => setAutoFitSize((prev) => !prev)}
              className={`px-2.5 py-1 rounded-lg border text-[10.5px] font-bold cursor-pointer transition ${
                autoFitSize
                  ? 'bg-[#087cf4] text-white border-[#087cf4] shadow-xs'
                  : 'bg-[#eff8ff] hover:bg-[#dff1ff] text-[#0754b9] border-[#a5d6ff]'
              }`}
            >
              {autoFitSize ? '📐 Auto Size (พอดีจอ)' : '🔍 ขนาดเต็ม 100%'}
            </button>
            {!autoFitSize && (
              <button
                type="button"
                onClick={centerTreeViewport}
                className="px-2.5 py-1 rounded-lg bg-[#eff8ff] hover:bg-[#dff1ff] border border-[#a5d6ff] text-[10.5px] font-bold text-[#0754b9] cursor-pointer"
              >
                🎯 จัดกึ่งกลางผัง
              </button>
            )}
          </div>
        </div>

        {/* 5-Layer Circular Binary Tree (Layer 0 -> Layer 4: 1 -> 2 -> 4 -> 8 -> 16 = 31 slots) */}
        <div
          ref={treeScrollRef}
          className={`mt-3 rounded-[18px] bg-[#ebf3fb] border border-[#c6dff6] p-2.5 sm:p-4 ${
            autoFitSize ? 'overflow-hidden' : 'overflow-x-auto matrix-scroll-container'
          }`}
        >
          <div ref={treeMeasureRef} className="w-full">
            <div
              className="mx-auto relative"
              style={
                autoFitSize
                  ? {
                      width: `${Math.round(TREE_CANVAS_WIDTH * treeScale)}px`,
                      height: `${Math.round(TREE_CANVAS_HEIGHT * treeScale)}px`,
                    }
                  : {
                      width: `${TREE_CANVAS_WIDTH}px`,
                      height: `${TREE_CANVAS_HEIGHT}px`,
                    }
              }
            >
              <div
                className="px-4 py-[14px] select-none"
                style={{
                  width: `${TREE_CANVAS_WIDTH}px`,
                  height: `${TREE_CANVAS_HEIGHT}px`,
                  transform: autoFitSize ? `scale(${treeScale})` : undefined,
                  transformOrigin: 'top left',
                }}
              >
                {[0, 1, 2, 3, 4].map((layerIdx) => {
                  const slots = fiveLayerSlots[layerIdx] || [];
                  const slotCount = 2 ** layerIdx;
                  const cellWidth = TREE_CONTENT_WIDTH / slotCount;
                  const circleSpecs =
                    layerIdx === 0
                      ? { sizeClass: 'w-[96px] h-[96px]', borderClass: 'border-[5px]', emptyBorderClass: 'border-[3.5px]' }
                      : layerIdx === 1
                      ? { sizeClass: 'w-[88px] h-[88px]', borderClass: 'border-[5px]', emptyBorderClass: 'border-[3.5px]' }
                      : layerIdx === 2
                      ? { sizeClass: 'w-[80px] h-[80px]', borderClass: 'border-[4px]', emptyBorderClass: 'border-[3px]' }
                      : layerIdx === 3
                      ? { sizeClass: 'w-[72px] h-[72px]', borderClass: 'border-[4px]', emptyBorderClass: 'border-[3px]' }
                      : { sizeClass: 'w-[64px] h-[64px]', borderClass: 'border-[4px]', emptyBorderClass: 'border-[3px]' };

                  const nextSlots = layerIdx < 4 ? fiveLayerSlots[layerIdx + 1] || [] : [];
                  const nextCellWidth = layerIdx < 4 ? TREE_CONTENT_WIDTH / 2 ** (layerIdx + 1) : 0;

                  return (
                    <React.Fragment key={`tree-layer-${layerIdx}`}>
                      {/* Layer Row */}
                      <div className="flex items-center">
                        {slots.map((node, idx) => {
                          const isRoot = layerIdx === 0;
                          const isLeft = idx % 2 === 0;
                          const sideLabel = isRoot ? 'ROOT' : isLeft ? 'ซ้าย' : 'ขวา';

                          if (!node) {
                            return (
                              <div
                                key={`l${layerIdx}-slot-${idx}`}
                                style={{ width: `${cellWidth}px` }}
                                className="shrink-0 flex flex-col items-center justify-center"
                              >
                                <div
                                  className={`${circleSpecs.sizeClass} aspect-square shrink-0 relative overflow-hidden rounded-full flex flex-col items-center justify-center text-center p-1 bg-[#f4f8fd]/90 ${circleSpecs.emptyBorderClass} border-dashed border-[#8fb6db] text-[#6d8aa8] shadow-[0_2px_6px_rgba(15,45,95,0.06),inset_0_2px_6px_rgba(255,255,255,0.88)]`}
                                >
                                  <span
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_22%,rgba(255,255,255,0.72)_0%,rgba(255,255,255,0.1)_42%,rgba(120,165,215,0.08)_100%)]"
                                  />
                                  <span
                                    className={`relative z-10 ${
                                      layerIdx >= 4 ? 'text-[7px]' : 'text-[8px]'
                                    } font-bold leading-none`}
                                  >
                                    {sideLabel}
                                  </span>
                                  <b
                                    className={`relative z-10 ${
                                      layerIdx >= 4 ? 'text-[10.5px]' : layerIdx === 3 ? 'text-[11px]' : 'text-[12px]'
                                    } font-black leading-tight mt-0.5`}
                                  >
                                    ว่าง
                                  </b>
                                  {layerIdx < 4 && (
                                    <span className="relative z-10 text-[7.5px] leading-none mt-0.5">
                                      ชั้น {layerIdx}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          }

                          const mainId = getMainId(node, effectiveRootId);
                          const cloneSeq = cloneSeqByNodeId.get(Number(node.id)) || 0;
                          const statusTxt =
                            layerIdx <= 1
                              ? getDisplayStatusText(node, cloneSeq)
                              : isCloneNode(node)
                              ? cloneSeq > 0
                                ? `โคลน #${cloneSeq}`
                                : 'โคลนนิ่ง'
                              : isExtraNode(node)
                              ? 'Extra'
                              : isAutoNode(node)
                              ? 'Auto'
                              : 'Main';
                          const appearance = getCardAppearance(node);

                          return (
                            <div
                              key={`l${layerIdx}-node-${idx}-${node.id}`}
                              style={{ width: `${cellWidth}px` }}
                              className="shrink-0 flex flex-col items-center justify-center"
                            >
                              <button
                                type="button"
                                onClick={() => !isRoot && focusNodeAsRoot(Number(node.id))}
                                title={`ID #${mainId} · ${getNodeTypeLabel(
                                  node,
                                  cloneSeq,
                                  (cloneIdsByMainId.get(mainId) || []).length
                                )} · [${appearance.categoryHint}] · แนะนำโดย #${
                                  node.directSponsorNodeId || '-'
                                } · โหนด #${node.id} · ${shortAddr(node.owner)}${
                                  isRoot ? '' : ' · แตะเพื่อดูสายนี้'
                                }`}
                                className={`${circleSpecs.sizeClass} aspect-square shrink-0 relative overflow-hidden rounded-full flex flex-col items-center justify-center text-center p-1 ${appearance.sphereClass} transition ${
                                  isRoot
                                    ? 'cursor-default'
                                    : 'hover:scale-105 active:scale-95 cursor-pointer'
                                }`}
                              >
                                <span
                                  aria-hidden="true"
                                  className="pointer-events-none absolute top-[6%] left-[14%] w-[44%] h-[28%] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.68)_0%,rgba(255,255,255,0)_75%)] -rotate-18"
                                />
                                <span
                                  className={`relative z-10 ${
                                    layerIdx >= 4
                                      ? 'text-[6.5px]'
                                      : layerIdx === 3
                                      ? 'text-[7px]'
                                      : 'text-[8px]'
                                  } font-extrabold uppercase tracking-wide ${appearance.topTextClass} leading-none`}
                                >
                                  {isRoot ? 'ROOT' : layerIdx === 1 ? `ชั้น 1 · ${sideLabel}` : sideLabel}
                                </span>
                                <b
                                  className={`relative z-10 ${
                                    layerIdx === 0
                                      ? 'text-[17px]'
                                      : layerIdx === 1
                                      ? 'text-[15px]'
                                      : layerIdx === 2
                                      ? 'text-[13px]'
                                      : layerIdx === 3
                                      ? 'text-[12px]'
                                      : 'text-[11px]'
                                  } font-black font-mono leading-tight ${appearance.idTextClass} mt-0.5`}
                                >
                                  #{mainId}
                                </b>
                                <span
                                  className={`relative z-10 ${
                                    layerIdx >= 4
                                      ? 'text-[6.8px] max-w-[48px]'
                                      : layerIdx === 3
                                      ? 'text-[7.5px] max-w-[54px]'
                                      : 'text-[8.5px] max-w-[68px]'
                                  } font-bold ${appearance.subTextClass} leading-tight truncate`}
                                >
                                  {statusTxt}
                                </span>
                                {layerIdx <= 2 && Number(node.id) !== mainId && (
                                  <span className={`relative z-10 text-[7px] font-mono ${appearance.metaTextClass} leading-none mt-0.5`}>
                                    โหนด#{node.id}
                                  </span>
                                )}
                                {layerIdx <= 1 && Number(node.id) === mainId && (
                                  <span className={`relative z-10 text-[7px] font-mono ${appearance.metaTextClass} leading-none mt-0.5`}>
                                    แนะนำ#{node.directSponsorNodeId || '-'}
                                  </span>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Connector SVG between layerIdx and layerIdx + 1 */}
                      {layerIdx < 4 && (
                        <svg
                          viewBox={`0 0 ${TREE_CONTENT_WIDTH} 30`}
                          width={TREE_CONTENT_WIDTH}
                          height="30"
                          className="block"
                          aria-hidden="true"
                        >
                          {slots.map((parentNode, pIdx) => {
                            const px = (pIdx + 0.5) * cellWidth;
                            const leftChild = nextSlots[pIdx * 2];
                            const rightChild = nextSlots[pIdx * 2 + 1];
                            const lx = (pIdx * 2 + 0.5) * nextCellWidth;
                            const rx = (pIdx * 2 + 1.5) * nextCellWidth;
                            return (
                              <g key={`conn-l${layerIdx}-${pIdx}`}>
                                <line
                                  x1={px}
                                  y1={0}
                                  x2={px}
                                  y2={13}
                                  stroke={parentNode ? '#7ba7d2' : '#c0d5ea'}
                                  strokeWidth="2"
                                  strokeDasharray={parentNode ? undefined : '4 3'}
                                />
                                <line
                                  x1={lx}
                                  y1={13}
                                  x2={px}
                                  y2={13}
                                  stroke={leftChild ? '#5c9cd9' : '#c0d5ea'}
                                  strokeWidth="2"
                                  strokeDasharray={leftChild ? undefined : '4 3'}
                                />
                                <line
                                  x1={px}
                                  y1={13}
                                  x2={rx}
                                  y2={13}
                                  stroke={rightChild ? '#8c7be3' : '#c0d5ea'}
                                  strokeWidth="2"
                                  strokeDasharray={rightChild ? undefined : '4 3'}
                                />
                                <line
                                  x1={lx}
                                  y1={13}
                                  x2={lx}
                                  y2={30}
                                  stroke={leftChild ? '#5c9cd9' : '#c0d5ea'}
                                  strokeWidth="2"
                                  strokeDasharray={leftChild ? undefined : '4 3'}
                                />
                                <line
                                  x1={rx}
                                  y1={13}
                                  x2={rx}
                                  y2={30}
                                  stroke={rightChild ? '#8c7be3' : '#c0d5ea'}
                                  strokeWidth="2"
                                  strokeDasharray={rightChild ? undefined : '4 3'}
                                />
                              </g>
                            );
                          })}
                        </svg>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Layer caption & Root full detail strip */}
        <div className="mt-3 px-3 py-2 rounded-xl bg-[#edf8ff] border border-[#c6e6ff] text-center text-[10.5px] text-[#35567e]">
          <span className="font-bold text-[#0754b9]">
            แสดงผัง 5 ชั้น (ชั้น 0 = 1 · ชั้น 1 = 2 · ชั้น 2 = 4 · ชั้น 3 = 8 · ชั้น 4 = 16 · รวม 31 ตำแหน่ง)
          </span>
          {rootNode && (
            <div className="mt-0.5 text-[10px] text-[#4c6f97]">
              ROOT ปัจจุบัน:{' '}
              <strong className="font-mono text-[#09275f]">
                #{getMainId(rootNode, effectiveRootId)}
              </strong>{' '}
              (
              {getNodeTypeLabel(
                rootNode,
                cloneSeqByNodeId.get(Number(rootNode.id)) || 0,
                (cloneIdsByMainId.get(getMainId(rootNode)) || []).length
              )}
              {rootNode.id !== getMainId(rootNode) ? ` · โหนด #${rootNode.id}` : ''}) · แนะนำโดย{' '}
              <strong className="font-mono">#{rootNode.directSponsorNodeId || '-'}</strong> ·{' '}
              <span className="font-mono">{shortAddr(rootNode.owner)}</span> · แตะวงกลมเพื่อเจาะดูสายนั้น
            </div>
          )}
        </div>

        {/* Selected Layer Detail Panel */}
        <div className="flex items-center justify-between gap-2 mt-5 mb-2 flex-wrap">
          <h3 className="text-[15px] sm:text-[16px] font-black text-[#09275f]">
            ชั้นที่ {selectedLayer}
          </h3>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10.5px] font-bold px-2.5 py-1 rounded-full bg-[#e4f4ff] text-[#0757b8] font-mono tabular-nums">
              {fmtNum(theoreticalCapacity)} ตำแหน่ง · พบ {currentLayerEntries.length} รหัส
            </span>
            {currentLayerEntries.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setPopupTypeFilter('ALL');
                  setPopupSearch('');
                  setLayerPopupModal(selectedLayer);
                }}
                className="px-2.5 py-1 rounded-full bg-[#087cf4] hover:bg-[#0568d0] text-white text-[10.5px] font-bold inline-flex items-center gap-1 cursor-pointer shadow-xs"
              >
                <Users className="w-3 h-3" /> ดูรายชื่อชั้น {selectedLayer}
              </button>
            )}
          </div>
        </div>

        <div className="p-3 rounded-[16px] bg-[#f4fbff] border border-[#c6e6ff]">
          <b className="text-xs font-black text-[#09275f]">
            รายละเอียดตำแหน่ง (ชั้นที่ {selectedLayer})
          </b>
          <p className="text-[11px] text-[#58769d] leading-relaxed mt-1">
            {selectedLayer === 0
              ? `ชั้นที่ 0 เป็นตำแหน่ง Root ของผัง (ID #${effectiveRootId}) · มีตำแหน่งลูกชั้นที่ 1 ซ้าย ${
                  leftChildNode ? `#${leftChildNode.id}` : 'ว่าง'
                } / ขวา ${rightChildNode ? `#${rightChildNode.id}` : 'ว่าง'}`
              : `ชั้นที่ ${selectedLayer} มีตำแหน่งตามทฤษฎี ${fmtNum(
                  theoreticalCapacity
                )} ตำแหน่ง โดยแต่ละตำแหน่งมีลูกได้สูงสุด 2 ตำแหน่ง · ปัจจุบันพบสมาชิกจริง ${
                  currentLayerEntries.length
                } รหัส`}
          </p>

          {selectedLayer === 0 ? (
            <div className="relative flex justify-center gap-4 mx-auto mt-5 max-w-[430px]">
              <div className="absolute -top-[12px] left-1/4 right-1/4 h-[1px] bg-[#4c9fe5]" />
              <div
                onClick={() => leftChildNode && focusNodeAsRoot(Number(leftChildNode.id))}
                className={`relative flex-1 max-w-[180px] text-center p-2.5 rounded-[14px] ${
                  leftChildNode
                    ? 'bg-white border border-[#9fd5ff] border-b-4 border-b-[#16a9ff] cursor-pointer hover:bg-[#eff9ff]'
                    : 'bg-[#f6fbff] border border-dashed border-[#b8d9f5] text-[#7692b6]'
                }`}
              >
                <span className="absolute -top-[13px] left-1/2 w-[1px] h-[13px] bg-[#4c9fe5]" />
                <b className="block text-xs font-black">
                  {leftChildNode ? `LEFT CHILD · ID #${getMainId(leftChildNode)}` : 'LEFT CHILD'}
                </b>
                <small className="block text-[10px] mt-0.5 text-[#5a78a1]">
                  {leftChildNode
                    ? getNodeTypeLabel(
                        leftChildNode,
                        cloneSeqByNodeId.get(Number(leftChildNode.id)) || 0,
                        (cloneIdsByMainId.get(getMainId(leftChildNode)) || []).length
                      )
                    : 'รอข้อมูลสมาชิก'}
                </small>
              </div>

              <div
                onClick={() => rightChildNode && focusNodeAsRoot(Number(rightChildNode.id))}
                className={`relative flex-1 max-w-[180px] text-center p-2.5 rounded-[14px] ${
                  rightChildNode
                    ? 'bg-white border border-[#c6b5ff] border-b-4 border-b-[#8c62e9] cursor-pointer hover:bg-[#f8f5ff]'
                    : 'bg-[#f6fbff] border border-dashed border-[#b8d9f5] text-[#7692b6]'
                }`}
              >
                <span className="absolute -top-[13px] left-1/2 w-[1px] h-[13px] bg-[#4c9fe5]" />
                <b className="block text-xs font-black">
                  {rightChildNode ? `RIGHT CHILD · ID #${getMainId(rightChildNode)}` : 'RIGHT CHILD'}
                </b>
                <small className="block text-[10px] mt-0.5 text-[#5a78a1]">
                  {rightChildNode
                    ? getNodeTypeLabel(
                        rightChildNode,
                        cloneSeqByNodeId.get(Number(rightChildNode.id)) || 0,
                        (cloneIdsByMainId.get(getMainId(rightChildNode)) || []).length
                      )
                    : 'รอข้อมูลสมาชิก'}
                </small>
              </div>
            </div>
          ) : currentLayerEntries.length === 0 ? (
            <div className="relative flex justify-center gap-4 mx-auto mt-5 max-w-[430px]">
              <div className="absolute -top-[12px] left-1/4 right-1/4 h-[1px] bg-[#4c9fe5]" />
              <div className="relative flex-1 max-w-[180px] text-center p-2.5 rounded-[14px] bg-[#f6fbff] border border-dashed border-[#b8d9f5] text-[#7692b6]">
                <span className="absolute -top-[13px] left-1/2 w-[1px] h-[13px] bg-[#4c9fe5]" />
                <b className="block text-xs font-black">LEFT CHILD</b>
                <small className="block text-[10px] mt-0.5">รอสมาชิกในชั้นที่ {selectedLayer}</small>
              </div>
              <div className="relative flex-1 max-w-[180px] text-center p-2.5 rounded-[14px] bg-[#f6fbff] border border-dashed border-[#b8d9f5] text-[#7692b6]">
                <span className="absolute -top-[13px] left-1/2 w-[1px] h-[13px] bg-[#4c9fe5]" />
                <b className="block text-xs font-black">RIGHT CHILD</b>
                <small className="block text-[10px] mt-0.5">รอสมาชิกในชั้นที่ {selectedLayer}</small>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2.5 max-h-[340px] overflow-y-auto pr-1">
              {currentLayerEntries.map((entry) => {
                const n = entry.node;
                const isLeftSide = entry.side === 'LEFT';
                return (
                  <div
                    key={`layer-node-${n.id}`}
                    className={`p-2.5 rounded-[14px] bg-white border border-[#b4ddff] border-b-4 ${
                      isLeftSide ? 'border-b-[#16a9ff]' : 'border-b-[#8c62e9]'
                    } flex items-center justify-between gap-2 text-xs`}
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-black text-[#09275f] font-mono">
                        ID #{getMainId(n)}{' '}
                        <span className="text-[10px] font-sans font-bold text-[#0756bc]">
                          ·{' '}
                          {getDisplayStatusText(
                            n,
                            cloneSeqByNodeId.get(Number(n.id)) || 0
                          )}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#45668f] truncate">
                        {n.id !== getMainId(n) ? `โหนด #${n.id} · ` : ''}
                        ใต้ #{entry.parentId} ({isLeftSide ? 'ซ้าย' : 'ขวา'}) · แนะนำ #
                        {n.directSponsorNodeId || '-'}
                      </div>
                      <div className="text-[10px] font-mono text-[#6584ab]">
                        ซ้าย: {n.leftChild > 0 ? `#${n.leftChild}` : 'ว่าง'} · ขวา:{' '}
                        {n.rightChild > 0 ? `#${n.rightChild}` : 'ว่าง'}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => focusNodeAsRoot(Number(n.id))}
                        className="px-2 py-1 rounded-lg bg-[#087cf4] text-white text-[10px] font-bold hover:bg-[#0568d0] cursor-pointer"
                      >
                        เปิดผัง
                      </button>
                      {!n.isExtraId && !n.isClone && (
                        <button
                          type="button"
                          onClick={() => onSelectMainId(String(getMainId(n)))}
                          className="px-2 py-0.5 rounded-lg bg-[#e6f5ff] border border-[#a5d6ff] text-[#0754b9] text-[10px] font-bold cursor-pointer"
                        >
                          ดู ID
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 4. 15-LAYER SELECTOR GRID */}
      <section className="mx-1 p-4 rounded-[21px] bg-white/90 border border-[#b8e1ff] shadow-[0_8px_22px_rgba(7,85,181,0.17)]">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-[15px] sm:text-[16px] font-black text-[#09275f]">
            📚 เลือกดูชั้น 0–15 (Root → ชั้น 15)
          </h3>
          <small className="text-[10.5px] font-semibold text-[#5a78a1]">
            แตะชั้นที่ต้องการ
          </small>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {Array.from({ length: 16 }, (_, idx) => idx).map((n) => {
            const selected = selectedLayer === n;
            const realCount = (layersMap[n] || []).length;
            return (
              <button
                key={`layer-card-${n}`}
                type="button"
                onClick={() => chooseLayer(n)}
                className={`p-2.5 rounded-[14px] border text-left transition cursor-pointer ${
                  selected
                    ? 'bg-gradient-to-br from-[#087cf4] to-[#0648b2] text-white border-[#57d8ff] shadow-md'
                    : 'bg-gradient-to-br from-white to-[#e3f4ff] text-[#09275f] border-[#b2dafa] hover:border-[#087cf4]'
                }`}
              >
                <b className="block text-[13px] font-black">
                  ชั้นที่ {n}{n === 0 ? ' (Root)' : ''}
                </b>
                <small
                  className={`block text-[10px] mt-0.5 font-mono tabular-nums ${
                    selected ? 'text-[#e2f8ff]' : 'text-[#5a78a1]'
                  }`}
                >
                  {fmtNum(2 ** n)} ตำแหน่งสูงสุด*
                </small>
                <small
                  className={`block text-[10px] font-bold mt-0.5 font-mono ${
                    selected
                      ? 'text-[#ffdf6d]'
                      : realCount > 0
                      ? 'text-emerald-700'
                      : 'text-[#7c97b8]'
                  }`}
                >
                  พบจริง {realCount} รหัส
                </small>
              </button>
            );
          })}
        </div>
      </section>

      {/* 5. 15-LAYER SUMMARY TABLE */}
      <section className="mx-1 p-4 rounded-[21px] bg-white/90 border border-[#b8e1ff] shadow-[0_8px_22px_rgba(7,85,181,0.17)]">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <div>
            <h3 className="text-[15px] sm:text-[16px] font-black text-[#09275f]">
              📋 สรุปโครงสร้างแต่ละชั้น
            </h3>
            <small className="text-[10.5px] font-semibold text-[#5a78a1]">
              ความจุตามทฤษฎี & สมาชิกจริง
            </small>
          </div>
          {totalSubtreeCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setPopupTypeFilter('ALL');
                setPopupSearch('');
                setLayerPopupModal('all');
              }}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#22caff] to-[#0758d4] text-white text-[11px] font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer hover:brightness-105 transition"
            >
              <Users className="w-3.5 h-3.5" />
              <span>ดูสมาชิกจริงทั้งหมด ({totalSubtreeCount} รหัส)</span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-1.5 min-w-[480px] text-xs">
            <thead>
              <tr className="text-left text-[#54749b]">
                <th className="px-2 py-1.5">ชั้น</th>
                <th className="px-2 py-1.5">ตำแหน่งสูงสุด*</th>
                <th className="px-2 py-1.5">ตำแหน่งลูกชั้นถัดไป</th>
                <th className="px-2 py-1.5">ข้อมูลสมาชิกจริง (ใต้ #{effectiveRootId})</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 16 }, (_, idx) => idx).map((n) => {
                const realEntries = layersMap[n] || [];
                const previewIds = realEntries
                  .slice(0, 3)
                  .map((e) => `#${getMainId(e.node)}${isCloneNode(e.node) ? '(โคลน)' : ''}`)
                  .join(', ');
                const extraMore = realEntries.length > 3 ? ` +${realEntries.length - 3}` : '';
                const isRowSelected = selectedLayer === n;
                return (
                  <tr
                    key={`layer-row-${n}`}
                    onClick={() => chooseLayer(n)}
                    className={`cursor-pointer transition ${
                      isRowSelected ? 'ring-2 ring-[#087cf4] rounded-[10px]' : ''
                    }`}
                  >
                    <td
                      className={`px-2.5 py-2.5 rounded-l-[10px] font-bold ${
                        isRowSelected
                          ? 'bg-[#087cf4] text-white'
                          : 'bg-[#edf7ff] text-[#0757b8]'
                      }`}
                    >
                      ชั้น {n}
                    </td>
                    <td
                      className={`px-2.5 py-2.5 font-mono tabular-nums ${
                        isRowSelected ? 'bg-[#dff2ff]' : 'bg-[#edf7ff]'
                      }`}
                    >
                      {fmtNum(2 ** n)}
                    </td>
                    <td
                      className={`px-2.5 py-2.5 font-mono tabular-nums ${
                        isRowSelected ? 'bg-[#dff2ff]' : 'bg-[#edf7ff]'
                      }`}
                    >
                      {n === 15 ? '—' : fmtNum(2 ** (n + 1))}
                    </td>
                    <td
                      className={`px-2.5 py-2.5 rounded-r-[10px] ${
                        isRowSelected ? 'bg-[#dff2ff]' : 'bg-[#edf7ff]'
                      }`}
                    >
                      {realEntries.length > 0 ? (
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-bold text-emerald-700">
                            {realEntries.length} รหัส{' '}
                            <span className="font-mono text-[#09275f] font-normal">
                              ({previewIds}
                              {extraMore})
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              chooseLayer(n);
                              setPopupTypeFilter('ALL');
                              setPopupSearch('');
                              setLayerPopupModal(n);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#087cf4] hover:bg-[#0568d0] text-white text-[10.5px] font-bold inline-flex items-center gap-1 whitespace-nowrap cursor-pointer shadow-xs"
                          >
                            <Users className="w-3 h-3" />
                            <span>ดูข้อมูลสมาชิก</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-[#6d8aad]">ว่าง (0 รหัส)</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-[#58769d] leading-relaxed mt-2">
          กดปุ่ม <strong className="text-[#0754b9]">ดูข้อมูลสมาชิก</strong> ในคอลัมน์ข้อมูลสมาชิกจริง เพื่อเปิดป๊อปอัพแสดง ID, สถานะไอดี และผู้แนะนำของแต่ละรหัส
        </p>
      </section>

      {/* POPUP MODAL: REAL MEMBERS IN LAYER / SUBTREE (ID, STATUS, SPONSOR) */}
      {layerPopupModal !== null && (() => {
        const rawEntries: LayerNodeEntry[] =
          layerPopupModal === 'all'
            ? Array.from({ length: 16 }, (_, idx) => layersMap[idx] || []).flat()
            : layersMap[layerPopupModal] || [];

        const tagCounts = {
          ALL: rawEntries.length,
          MAIN: 0,
          AUTO: 0,
          CLONE: 0,
          EXTRA: 0,
        };
        for (const entry of rawEntries) {
          const tag = getShortTypeTag(entry.node) as 'MAIN' | 'AUTO' | 'CLONE' | 'EXTRA';
          if (tagCounts[tag] !== undefined) tagCounts[tag] += 1;
        }

        const qTrim = popupSearch.trim().toLowerCase().replace(/^#/, '');
        const filteredEntries = rawEntries.filter((entry) => {
          const n = entry.node;
          const tag = getShortTypeTag(n);
          if (popupTypeFilter !== 'ALL' && tag !== popupTypeFilter) return false;
          if (qTrim) {
            const mainIdNum = getMainId(n);
            const totalClones = (cloneIdsByMainId.get(mainIdNum) || []).length;
            const cloneSeq = cloneSeqByNodeId.get(Number(n.id)) || 0;
            const originNode = n.originMainId ? nodeMap.get(Number(n.originMainId)) : undefined;
            const sponsorId =
              Number(n.directSponsorNodeId || 0) > 0
                ? Number(n.directSponsorNodeId)
                : Number(originNode?.directSponsorNodeId || n.originMainId || 0);
            const hay = `${n.id} #${n.id} ${mainIdNum} #${mainIdNum} ${getNodeTypeLabel(
              n,
              cloneSeq,
              totalClones
            )} ${tag} ${sponsorId} #${sponsorId} ${n.owner || ''}`.toLowerCase();
            if (!hay.includes(qTrim)) return false;
          }
          return true;
        });

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
            onClick={() => setLayerPopupModal(null)}
          >
            <div
              className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-[24px] bg-gradient-to-br from-white to-[#e3f4ff] border-2 border-[#a9ddff] shadow-2xl p-4 sm:p-5 text-[#09265f] space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between gap-2 border-b border-[#b8e5ff] pb-2.5">
                <div>
                  <h3 className="text-base sm:text-lg font-black text-[#09265f]">
                    {layerPopupModal === 'all'
                      ? `👥 ข้อมูลสมาชิกจริง (ชั้น 0–15 · Rank ${matrixRank} · ใต้ #${effectiveRootId})`
                      : `👥 ข้อมูลสมาชิกจริง — ชั้นที่ ${layerPopupModal} (Rank ${matrixRank} · ใต้ #${effectiveRootId})`}
                  </h3>
                  <p className="text-[11px] font-semibold text-[#45668f] mt-0.5">
                    แสดง ID · สถานะไอดี (Main / Auto / Clone / Extra) · ผู้แนะนำตรง
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLayerPopupModal(null)}
                  className="p-1.5 rounded-xl bg-white hover:bg-blue-50 border border-[#b8e5ff] text-[#0756bc] cursor-pointer shrink-0"
                  aria-label="ปิดหน้าต่าง"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Layer Quick Selector inside Modal */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setLayerPopupModal('all')}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap border cursor-pointer ${
                    layerPopupModal === 'all'
                      ? 'bg-[#087cf4] text-white border-[#087cf4]'
                      : 'bg-white text-[#0756bc] border-[#b8e5ff]'
                  }`}
                >
                  ทุกชั้น ({totalSubtreeCount})
                </button>
                {Array.from({ length: 16 }, (_, idx) => idx).map((layerNum) => {
                  const cnt = (layersMap[layerNum] || []).length;
                  if (cnt === 0 && layerPopupModal !== layerNum) return null;
                  const active = layerPopupModal === layerNum;
                  return (
                    <button
                      key={`pop-l-${layerNum}`}
                      type="button"
                      onClick={() => setLayerPopupModal(layerNum)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap border cursor-pointer ${
                        active
                          ? 'bg-[#087cf4] text-white border-[#087cf4]'
                          : 'bg-white text-[#0756bc] border-[#b8e5ff]'
                      }`}
                    >
                      ชั้น {layerNum} ({cnt})
                    </button>
                  );
                })}
              </div>

              {/* Status Filter Chips + Search */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(
                    [
                      { key: 'ALL', label: 'ทั้งหมด' },
                      { key: 'MAIN', label: 'Main ID' },
                      { key: 'AUTO', label: 'Auto ID' },
                      { key: 'CLONE', label: 'โคลนนิ่ง' },
                      { key: 'EXTRA', label: 'Extra ID' },
                    ] as const
                  ).map((f) => {
                    const active = popupTypeFilter === f.key;
                    const count = tagCounts[f.key];
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => setPopupTypeFilter(f.key)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer inline-flex items-center gap-1 ${
                          active
                            ? 'bg-[#0754b9] text-white border-[#0754b9]'
                            : 'bg-white text-[#0756bc] border-[#b8e5ff]'
                        }`}
                      >
                        <span>{f.label}</span>
                        <span
                          className={`px-1.5 rounded-full text-[10px] font-mono ${
                            active ? 'bg-white/25 text-white' : 'bg-[#e3f4ff] text-[#0756bc]'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#5a78a1] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={popupSearch}
                    onChange={(e) => setPopupSearch(e.target.value)}
                    placeholder="ค้นหาเลข ID, สถานะไอดี, เลขผู้แนะนำ หรือกระเป๋า..."
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-white border border-[#a9d7ff] text-xs font-semibold text-[#09265f] focus:outline-none focus:border-[#087cf4]"
                  />
                </div>
              </div>

              {/* Members Table / Cards */}
              {filteredEntries.length === 0 ? (
                <div className="p-6 text-center rounded-2xl bg-white border border-[#b8e5ff] text-xs font-semibold text-[#54759c]">
                  ไม่พบสมาชิกจริงตามเงื่อนไขที่เลือก
                </div>
              ) : (
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {filteredEntries.map((entry) => {
                    const n = entry.node;
                    const tag = getShortTypeTag(n);
                    const mainIdNum = getMainId(n);
                    const isClone = isCloneNode(n);
                    const totalClonesForMain = isClone
                      ? (cloneIdsByMainId.get(mainIdNum) || []).length
                      : 0;
                    const cloneSeq = isClone ? cloneSeqByNodeId.get(Number(n.id)) || 0 : 0;
                    const statusLabel = isClone
                      ? cloneSeq > 0
                        ? `โคลนนิ่ง · ครั้งที่ ${cloneSeq}`
                        : 'โคลนนิ่ง'
                      : getNodeTypeLabel(n);
                    const detailStatusLabel = isClone
                      ? `โคลนนิ่ง${cloneSeq > 0 ? ` ครั้งที่ ${cloneSeq}` : ''} ของ #${mainIdNum} (ทั้งหมด ${totalClonesForMain} ครั้ง · โหนด #${n.id})`
                      : n.id !== mainIdNum
                      ? `${statusLabel} (โหนด #${n.id})`
                      : statusLabel;
                    const originNode = n.originMainId
                      ? nodeMap.get(Number(n.originMainId))
                      : undefined;
                    const sponsorId =
                      Number(n.directSponsorNodeId || 0) > 0
                        ? Number(n.directSponsorNodeId)
                        : Number(originNode?.directSponsorNodeId || 0);
                    const sponsorNode = sponsorId > 0 ? nodeMap.get(sponsorId) : undefined;
                    const sponsorStatus = sponsorNode ? getShortTypeTag(sponsorNode) : '';

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
                        key={`pop-member-${entry.layer}-${n.id}`}
                        className="p-3 rounded-xl bg-white border border-[#b8e5ff] flex items-center justify-between gap-2.5 text-xs shadow-2xs"
                      >
                        <div className="min-w-0 space-y-1 flex-1">
                          {/* Row 1: Main ID + Status (+ Total Clones) + Layer */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-black text-sm text-[#0754b9]">
                              ID #{mainIdNum}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${badgeClass}`}
                            >
                              {statusLabel}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-[#eef7ff] text-[#35567e] font-mono text-[10px] font-bold">
                              ชั้น {entry.layer} ·{' '}
                              {entry.side === 'ROOT'
                                ? 'ROOT'
                                : entry.side === 'LEFT'
                                ? `ซ้ายใต้ #${entry.parentId}`
                                : `ขวาใต้ #${entry.parentId}`}
                            </span>
                          </div>

                          {/* Row 2: Explicit ID Status & Direct Sponsor */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] bg-[#f5fbff] px-2.5 py-1.5 rounded-lg border border-[#d7edff]">
                            <div>
                              <span className="text-[#5a78a1] font-semibold">สถานะไอดี: </span>
                              <strong className="text-[#09265f]">{detailStatusLabel}</strong>
                            </div>
                            <div>
                              <span className="text-[#5a78a1] font-semibold">ผู้แนะนำ: </span>
                              <strong className="font-mono text-[#0754b9]">
                                {sponsorId > 0 ? `#${sponsorId}` : '—'}
                              </strong>
                              {sponsorStatus && (
                                <span className="ml-1 text-[10px] text-[#54759c]">
                                  ({sponsorStatus})
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-[10px] font-mono text-[#6283aa]">
                            Wallet: {shortAddr(n.owner)} · Rank {matrixRank}
                            {n.id !== mainIdNum ? ` · โหนดในผัง #${n.id}` : ''}
                          </div>
                        </div>

                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              focusNodeAsRoot(Number(n.id));
                              setLayerPopupModal(null);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-[#087cf4] hover:bg-[#0568d0] text-white text-[10.5px] font-bold cursor-pointer whitespace-nowrap"
                          >
                            เปิดผัง #{n.id}
                          </button>
                          {!n.isExtraId && !n.isClone && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectMainId(String(mainIdNum));
                                setLayerPopupModal(null);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-[#e6f5ff] hover:bg-[#d5eeff] border border-[#a5d6ff] text-[#0754b9] text-[10.5px] font-bold cursor-pointer whitespace-nowrap"
                            >
                              สลับดู ID
                            </button>
                          )}
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

      {/* SEARCH POPUP MODAL (MAIN / CLONE / EXTRA / AUTO / MATRIX NODES) */}
      {isSearchModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60"
          onClick={() => setIsSearchModalOpen(false)}
        >
          <div
            className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-[24px] bg-gradient-to-br from-white to-[#e3f4ff] border-2 border-[#a9ddff] shadow-2xl text-[#09265f] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky Header + Input */}
            <div className="p-4 sm:p-5 border-b border-[#b8e5ff] space-y-3 bg-white/95">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base sm:text-lg font-black text-[#09265f]">
                    🔎 ค้นหาข้อมูลสมาชิก & รหัสทั้งหมด
                  </h3>
                  <p className="text-[11px] font-semibold text-[#45668f] mt-0.5">
                    พิมพ์เลข ID (เช่น 3) เพื่อดูครบทั้ง Main ID · โคลนนิ่ง · Extra ID · Auto ID และตำแหน่งในผัง
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSearchModalOpen(false)}
                  className="p-1.5 rounded-xl bg-white hover:bg-blue-50 border border-[#b8e5ff] text-[#0756bc] cursor-pointer shrink-0"
                  aria-label="ปิดหน้าต่างค้นหา"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-4 h-4 text-[#5a78a1] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    autoFocus
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') runMatrixSearch();
                    }}
                    placeholder="กรอกเลข ID (เช่น 3), Wallet (0x...) หรือ ชั้น 5"
                    className="w-full pl-9 pr-3 py-2.5 rounded-[13px] border border-[#9fcfff] bg-[#f7fcff] text-[#09275f] text-xs sm:text-[13px] font-semibold outline-none focus:border-[#087cf4] focus:ring-2 focus:ring-[#087cf4]/20"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => runMatrixSearch()}
                  className="px-4 py-2.5 rounded-[13px] text-white text-xs sm:text-[13px] font-bold bg-gradient-to-r from-[#22caff] to-[#0758d4] shadow-[0_4px_12px_rgba(8,124,244,0.35)] whitespace-nowrap shrink-0 cursor-pointer"
                >
                  ค้นหา
                </button>
              </div>

              {/* Quick ID suggestions */}
              <div className="flex items-center gap-1.5 flex-wrap text-[10.5px]">
                <span className="font-bold text-[#5a78a1]">ค้นหาด่วน:</span>
                {[displayId, 1, 2, 3]
                  .filter((v, idx, arr) => v > 0 && arr.indexOf(v) === idx)
                  .map((quickId) => (
                    <button
                      key={`q-id-${quickId}`}
                      type="button"
                      onClick={() => {
                        const qStr = String(quickId);
                        setSearchInput(qStr);
                        runMatrixSearch(qStr);
                      }}
                      className="px-2.5 py-0.5 rounded-full bg-[#eaf6ff] hover:bg-[#d6edff] border border-[#b4ddff] text-[#0754b9] font-mono font-bold cursor-pointer"
                    >
                      ID #{quickId}
                    </button>
                  ))}
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      setSearchResult(null);
                    }}
                    className="px-2.5 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold cursor-pointer ml-auto"
                  >
                    ล้างคำค้น
                  </button>
                )}
              </div>

              {/* Category Filter Tabs when results exist */}
              {searchResult && !searchResult.isError && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pt-1">
                  {(
                    [
                      {
                        key: 'all',
                        label: 'ทั้งหมด',
                        count:
                          (searchResult.mainHits?.length || 0) +
                          (searchResult.cloneHits?.length || 0) +
                          (searchResult.extraHits?.length || 0) +
                          (searchResult.autoHits?.length || 0) +
                          (searchResult.matches?.length || 0),
                      },
                      { key: 'main', label: 'ข้อมูลหลัก', count: searchResult.mainHits?.length || 0 },
                      { key: 'clone', label: 'โคลนนิ่ง', count: searchResult.cloneHits?.length || 0 },
                      { key: 'extra', label: 'Extra ID', count: searchResult.extraHits?.length || 0 },
                      { key: 'auto', label: 'Auto ID', count: searchResult.autoHits?.length || 0 },
                      {
                        key: 'tree',
                        label: `ในผัง R${matrixRank}`,
                        count: searchResult.matches?.length || 0,
                      },
                    ] as const
                  ).map((tab) => {
                    const active = searchTab === tab.key;
                    return (
                      <button
                        key={`st-${tab.key}`}
                        type="button"
                        onClick={() => setSearchTab(tab.key)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap border cursor-pointer inline-flex items-center gap-1 ${
                          active
                            ? 'bg-[#0754b9] text-white border-[#0754b9]'
                            : 'bg-white text-[#0756bc] border-[#b8e5ff] hover:bg-[#eef8ff]'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span
                          className={`px-1.5 rounded-full text-[10px] font-mono ${
                            active ? 'bg-white/25 text-white' : 'bg-[#e3f4ff] text-[#0756bc]'
                          }`}
                        >
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Scrollable Search Results Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
              {!searchResult ? (
                <div className="p-6 text-center rounded-2xl bg-white/90 border border-[#b8e5ff] text-xs font-semibold text-[#54759c] space-y-1">
                  <div>พิมพ์เลข ID (เช่น <strong className="font-mono text-[#0754b9]">3</strong>), Wallet (<strong className="font-mono">0x...</strong>) หรือเลขชั้น (เช่น <strong className="text-[#0754b9]">ชั้น 5</strong>) แล้วกดค้นหา</div>
                  <div className="text-[11px] text-[#6d8aad]">
                    ระบบจะดึงข้อมูลทั้ง Main ID, โคลนนิ่ง, Extra ID, Auto ID และโหนดในผัง Matrix มาแสดงในหน้าต่างนี้ทั้งหมด
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className={`text-xs font-bold px-3.5 py-2.5 rounded-xl border ${
                      searchResult.isError
                        ? 'text-[#9b4b16] bg-[#fff8e9] border-[#f3d9a7]'
                        : 'text-[#0b4b9c] bg-[#edf8ff] border-[#b4ddff]'
                    }`}
                  >
                    {searchResult.message}
                  </div>

                  {searchResult.layerJumpHint !== null &&
                    searchResult.layerJumpHint !== undefined && (
                      <div className="flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-white border border-[#bde2ff] text-[11px]">
                        <span className="font-semibold text-[#315b8b]">
                          💡 ต้องการกระโดดไปดูตำแหน่งใน <strong>ชั้น {searchResult.layerJumpHint}</strong> ของผัง Rank {matrixRank} หรือไม่?
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            chooseLayer(searchResult.layerJumpHint!);
                            setIsSearchModalOpen(false);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#087cf4] hover:bg-[#0568d0] text-white font-bold cursor-pointer whitespace-nowrap"
                        >
                          ไปที่ชั้น {searchResult.layerJumpHint}
                        </button>
                      </div>
                    )}

                  {/* 1. MAIN / AUTO ID PROFILE HITS */}
                  {(searchTab === 'all' || searchTab === 'main') &&
                    searchResult.mainHits &&
                    searchResult.mainHits.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-black text-[#09265f] flex items-center gap-1.5">
                          <span>👤 ข้อมูลหลัก (Main / Auto ID)</span>
                          <span className="px-1.5 py-0.5 rounded-full bg-[#dceeff] text-[#0754b9] font-mono text-[10px]">
                            {searchResult.mainHits.length}
                          </span>
                        </h4>
                        <div className="space-y-2.5">
                          {searchResult.mainHits.map((r: any) => {
                            const rId = Number(r.id);
                            const rRank = Math.max(1, Number(r.currentMaxRank || 1));
                            const d30 = Number(r.direct30TotalUsdt || 0);
                            const l30 = Number(r.level30TotalUsdt || 0);
                            const totalInc = Number((d30 + l30).toFixed(2));
                            const vaultRem = Number(r.vault35RemainingTotalUsdt || 0);
                            const clonesLen = (r.clonesSpawned || []).length;
                            const extrasLen = (r.autoExtraIdsSpawned || []).length;
                            const autosLen = (r.autoIdsSpawned || []).length;

                            return (
                              <div
                                key={`sr-main-${rId}`}
                                className="p-3.5 rounded-2xl bg-white border-2 border-[#a8d9ff] shadow-xs space-y-2.5"
                              >
                                <div className="flex items-start justify-between gap-2 flex-wrap">
                                  <div className="space-y-0.5">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <strong className="text-base font-black text-[#09265f] font-mono">
                                        {r.isAutoId ? `Auto ID #${rId}` : `Main ID #${rId}`}
                                      </strong>
                                      <span
                                        className={`px-2 py-0.5 rounded-full text-[10px] font-black text-white ${
                                          r.isAutoId ? 'bg-amber-600' : 'bg-[#0758d4]'
                                        }`}
                                      >
                                        {r.isAutoId ? 'AUTO ID' : 'MAIN ID'}
                                      </span>
                                      <span className="px-2 py-0.5 rounded-full bg-[#ffdf6d] text-[#09265f] text-[10px] font-black">
                                        Rank {rRank} / 18
                                      </span>
                                    </div>
                                    <div className="text-[11px] font-semibold text-[#4f7097]">
                                      ผู้แนะนำ #{r.directSponsorNodeId || 1} · Wallet:{' '}
                                      <span className="font-mono">{shortAddr(r.owner)}</span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() => jumpToRankAndNode(1, rId)}
                                      className="px-2.5 py-1.5 rounded-lg bg-[#087cf4] hover:bg-[#0568d0] text-white text-[11px] font-bold cursor-pointer whitespace-nowrap"
                                    >
                                      🌐 เปิดผัง R1-#{rId}
                                    </button>
                                    {rRank > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => jumpToRankAndNode(rRank, null, rId)}
                                        className="px-2.5 py-1.5 rounded-lg bg-[#e6f5ff] hover:bg-[#d5eeff] border border-[#9fd6ff] text-[#0754b9] text-[11px] font-bold cursor-pointer whitespace-nowrap"
                                      >
                                        🌐 เปิดผัง R{rRank}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onSelectMainId(String(rId));
                                        setIsSearchModalOpen(false);
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap"
                                    >
                                      📊 ดูหน้าข้อมูล #{rId}
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                                  <div className="p-2 rounded-xl bg-[#f5fbff] border border-[#d7edff]">
                                    <div className="text-[10px] font-bold text-[#5a78a1]">รายได้รวม</div>
                                    <div className="font-mono font-black text-emerald-700">
                                      {totalInc.toFixed(2)} USDT
                                    </div>
                                    <div className="text-[9.5px] text-[#5a78a1]">
                                      ตรง {d30.toFixed(1)} + ชั้น {l30.toFixed(1)}
                                    </div>
                                  </div>
                                  <div className="p-2 rounded-xl bg-[#f5fbff] border border-[#d7edff]">
                                    <div className="text-[10px] font-bold text-[#5a78a1]">Vault คงเหลือ</div>
                                    <div className="font-mono font-black text-[#09265f]">
                                      {vaultRem.toFixed(2)} USDT
                                    </div>
                                    <div className="text-[9.5px] text-[#5a78a1]">
                                      สะสม {Number(r.vault35GrossTotalUsdt || 0).toFixed(1)} U
                                    </div>
                                  </div>
                                  <div className="p-2 rounded-xl bg-[#f5fbff] border border-[#d7edff]">
                                    <div className="text-[10px] font-bold text-[#5a78a1]">โคลน / Extra</div>
                                    <div className="font-mono font-black text-[#0754b9]">
                                      โคลน {clonesLen} · Extra {extrasLen}
                                    </div>
                                    <div className="text-[9.5px] text-[#5a78a1]">รหัสลูกที่แตกตัว</div>
                                  </div>
                                  <div className="p-2 rounded-xl bg-[#f5fbff] border border-[#d7edff]">
                                    <div className="text-[10px] font-bold text-[#5a78a1]">Auto ID ที่แตก</div>
                                    <div className="font-mono font-black text-amber-700">
                                      {autosLen} รหัส
                                    </div>
                                    <div className="text-[9.5px] text-[#5a78a1]">ปลดล็อก R1–R{rRank}</div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  {/* 2. CLONE IDS */}
                  {(searchTab === 'all' || searchTab === 'clone') &&
                    searchResult.cloneHits &&
                    searchResult.cloneHits.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-black text-emerald-800 flex items-center gap-1.5">
                          <span>🧬 รหัสโคลนนิ่ง (Clone ID)</span>
                          <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-mono text-[10px]">
                            {searchResult.cloneHits.length}
                          </span>
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {searchResult.cloneHits.map((c) => (
                            <div
                              key={`sr-clone-${c.rank}-${c.id}`}
                              className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex flex-col justify-between gap-2 text-xs"
                            >
                              <div>
                                <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                  <strong className="font-mono font-black text-emerald-950">
                                    โคลน R{c.rank}-#{c.id}
                                  </strong>
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[9.5px] font-extrabold">
                                    ครั้งที่ {c.cloneSequence} (รอบ {c.cloneRound})
                                  </span>
                                </div>
                                <div className="text-[10.5px] text-emerald-900 mt-1">
                                  จาก Main #{c.originMainId} · ใต้ #{c.parentId}{' '}
                                  {c.side === 'LEFT' ? '(ซ้าย)' : c.side === 'RIGHT' ? '(ขวา)' : ''}
                                </div>
                                <div className="text-[10.5px] font-mono text-emerald-800 mt-0.5">
                                  รายได้: <strong>{c.incomeUsdt.toFixed(2)} U</strong> · Vault 35%:{' '}
                                  <strong>{c.vault35Usdt.toFixed(2)} U</strong>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => jumpToRankAndNode(c.rank, c.id)}
                                  className="px-2.5 py-1 rounded-lg bg-[#087cf4] hover:bg-[#0568d0] text-white text-[10.5px] font-bold cursor-pointer"
                                >
                                  🌐 เปิดผัง R{c.rank}-#{c.id}
                                </button>
                                {onSelectSubId && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onSelectSubId({
                                        kind: 'CLONE',
                                        rank: c.rank,
                                        nodeId: c.id,
                                        mainId: c.originMainId,
                                      });
                                      setIsSearchModalOpen(false);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10.5px] font-bold cursor-pointer"
                                  >
                                    📊 ดูรายได้โคลน
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* 3. EXTRA IDS */}
                  {(searchTab === 'all' || searchTab === 'extra') &&
                    searchResult.extraHits &&
                    searchResult.extraHits.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-black text-violet-900 flex items-center gap-1.5">
                          <span>✦ รหัส Extra ID</span>
                          <span className="px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-800 font-mono text-[10px]">
                            {searchResult.extraHits.length}
                          </span>
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {searchResult.extraHits.map((ex) => (
                            <div
                              key={`sr-extra-${ex.rank}-${ex.id}`}
                              className="p-3 rounded-2xl bg-violet-50/75 border border-violet-200 flex flex-col justify-between gap-2 text-xs"
                            >
                              <div>
                                <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                  <strong className="font-mono font-black text-violet-950">
                                    Extra R{ex.rank}-#{ex.id}
                                  </strong>
                                  <span className="px-2 py-0.5 rounded-full bg-violet-600 text-white text-[9.5px] font-extrabold">
                                    EXTRA ID
                                  </span>
                                </div>
                                <div className="text-[10.5px] text-violet-900 mt-1">
                                  จาก Main #{ex.originMainId} · ใต้ #{ex.parentId}{' '}
                                  {ex.side === 'LEFT' ? '(ซ้าย)' : ex.side === 'RIGHT' ? '(ขวา)' : ''}
                                </div>
                                <div className="text-[10.5px] font-mono text-violet-800 mt-0.5">
                                  รายได้: <strong>{ex.incomeUsdt.toFixed(2)} U</strong> · Vault 35%:{' '}
                                  <strong>{ex.vault35Usdt.toFixed(2)} U</strong>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => jumpToRankAndNode(ex.rank, ex.id)}
                                  className="px-2.5 py-1 rounded-lg bg-[#087cf4] hover:bg-[#0568d0] text-white text-[10.5px] font-bold cursor-pointer"
                                >
                                  🌐 เปิดผัง R{ex.rank}-#{ex.id}
                                </button>
                                {onSelectSubId && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onSelectSubId({
                                        kind: 'EXTRA',
                                        rank: ex.rank,
                                        nodeId: ex.id,
                                        mainId: ex.originMainId,
                                      });
                                      setIsSearchModalOpen(false);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[10.5px] font-bold cursor-pointer"
                                  >
                                    📊 ดูรายได้ Extra
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* 4. AUTO IDS */}
                  {(searchTab === 'all' || searchTab === 'auto') &&
                    searchResult.autoHits &&
                    searchResult.autoHits.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                          <span>👤 รหัส Auto ID</span>
                          <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-mono text-[10px]">
                            {searchResult.autoHits.length}
                          </span>
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {searchResult.autoHits.map((au) => (
                            <div
                              key={`sr-auto-${au.id}`}
                              className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200 flex flex-col justify-between gap-2 text-xs"
                            >
                              <div>
                                <div className="flex items-center justify-between gap-1.5 flex-wrap">
                                  <strong className="font-mono font-black text-amber-950">
                                    Auto ID #{au.id}
                                  </strong>
                                  <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white text-[9.5px] font-extrabold">
                                    Rank {au.currentMaxRank}
                                  </span>
                                </div>
                                <div className="text-[10.5px] text-amber-900 mt-1">
                                  แตกมาจาก Main #{au.spawnedByMainId}
                                  {au.parentId > 0
                                    ? ` · ใต้ #${au.parentId} ${
                                        au.side === 'LEFT' ? '(ซ้าย)' : au.side === 'RIGHT' ? '(ขวา)' : ''
                                      }`
                                    : ''}
                                </div>
                                <div className="text-[10.5px] font-mono text-amber-800 mt-0.5">
                                  รายได้: <strong>{au.incomeUsdt.toFixed(2)} U</strong> · Vault:{' '}
                                  <strong>{au.vaultRemainingUsdt.toFixed(2)} U</strong>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => jumpToRankAndNode(1, au.id)}
                                  className="px-2.5 py-1 rounded-lg bg-[#087cf4] hover:bg-[#0568d0] text-white text-[10.5px] font-bold cursor-pointer"
                                >
                                  🌐 เปิดผัง R1-#{au.id}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onSelectMainId(String(au.id));
                                    setIsSearchModalOpen(false);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10.5px] font-bold cursor-pointer"
                                >
                                  📊 ดูข้อมูล Auto #{au.id}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* 5. MATRIX NODES IN CURRENT RANK */}
                  {(searchTab === 'all' || searchTab === 'tree') &&
                    searchResult.matches &&
                    searchResult.matches.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-black text-[#09265f] flex items-center gap-1.5">
                          <span>🌐 ตำแหน่งโหนดในผัง Rank {matrixRank}</span>
                          <span className="px-1.5 py-0.5 rounded-full bg-[#dceeff] text-[#0754b9] font-mono text-[10px]">
                            {searchResult.matches.length}
                          </span>
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {searchResult.matches.map((m) => (
                            <div
                              key={`sr-node-${m.node.id}`}
                              className="p-2.5 rounded-xl bg-white border border-[#b4ddff] flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="font-black text-[#09265f] font-mono">
                                  ID #{getMainId(m.node)}{' '}
                                  <span className="text-[10px] font-sans text-[#0756bc]">
                                    ·{' '}
                                    {getDisplayStatusText(
                                      m.node,
                                      cloneSeqByNodeId.get(Number(m.node.id)) || 0
                                    )}
                                  </span>
                                </div>
                                <div className="text-[10px] text-[#4f7097] truncate">
                                  R{matrixRank}-#{m.node.id} ·{' '}
                                  {m.layerInSubtree !== undefined
                                    ? `ชั้น ${m.layerInSubtree} (ใต้ #${effectiveRootId})`
                                    : m.layerFromGlobal !== undefined
                                    ? `ชั้น ${m.layerFromGlobal} (จาก #1)`
                                    : ''}{' '}
                                  · Parent #{m.node.parentId || 0}{' '}
                                  {m.node.parentId > 0 ? (m.node.isLeft ? '(ซ้าย)' : '(ขวา)') : ''}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  focusNodeAsRoot(Number(m.node.id));
                                  setIsSearchModalOpen(false);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-[#087cf4] hover:bg-[#0568d0] text-white text-[10.5px] font-bold whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                เปิดผัง #{m.node.id}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
