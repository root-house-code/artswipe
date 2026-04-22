import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Heart, X, Users, Sparkles, Check, Copy, RefreshCw, AlertCircle, ShoppingBag, ExternalLink } from 'lucide-react';

import './storage/storage.js';           // side-effect: attaches window.storage
import { fetchPage, SOURCE_NAME } from './api/index.js';

// How many items need to be in the queue before we fetch more.
const PREFETCH_THRESHOLD = 8;
// Items per API request.
const PAGE_SIZE = 50;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Root ----------
export default function App() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState('swipe');
  const [handle, setHandle] = useState(null);
  const [showHandleDialog, setShowHandleDialog] = useState(false);

  const [queue, setQueue] = useState([]);
  const [liked, setLiked] = useState([]);
  const [seenIds, setSeenIds] = useState(new Set());
  const [detailArt, setDetailArt] = useState(null);
  const [shopArt, setShopArt] = useState(null);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // Ref versions of state that fetchMore needs — avoids stale closures
  // without making fetchMore re-create every render.
  const seenIdsRef = useRef(seenIds);
  const pageRef = useRef(page);
  const hasMoreRef = useRef(hasMore);
  const fetchingRef = useRef(fetching);
  useEffect(() => { seenIdsRef.current = seenIds; }, [seenIds]);
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { hasMoreRef.current = hasMore; }, [hasMore]);
  useEffect(() => { fetchingRef.current = fetching; }, [fetching]);

  const fetchMore = useCallback(async () => {
    if (fetchingRef.current || !hasMoreRef.current) return;
    setFetching(true);
    setFetchError(null);
    try {
      const { items, hasMore: more } = await fetchPage(pageRef.current, PAGE_SIZE);
      const seen = seenIdsRef.current;
      const fresh = items.filter(item => !seen.has(item.id));
      setQueue(q => {
        const existing = new Set(q.map(x => x.id));
        return [...q, ...shuffle(fresh.filter(x => !existing.has(x.id)))];
      });
      setPage(p => p + 1);
      setHasMore(more);
    } catch (err) {
      console.error('[fetchMore]', err);
      setFetchError(err.message || String(err));
    } finally {
      setFetching(false);
    }
  }, []);

  // ---- Bootstrap ----
  useEffect(() => {
    (async () => {
      try {
        const p = await window.storage.get('profile');
        if (p?.value) setHandle(JSON.parse(p.value).handle);
        else setShowHandleDialog(true);
      } catch { setShowHandleDialog(true); }

      let likedArr = [];
      try { const l = await window.storage.get('liked'); if (l?.value) likedArr = JSON.parse(l.value); } catch {}
      setLiked(likedArr);

      let seenArr = [];
      try { const s = await window.storage.get('seen'); if (s?.value) seenArr = JSON.parse(s.value); } catch {}
      const seenSet = new Set(seenArr);
      setSeenIds(seenSet);
      seenIdsRef.current = seenSet;

      setReady(true);
      fetchMore(); // initial catalog fetch
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the queue topped up as items are swiped away.
  useEffect(() => {
    if (ready && queue.length < PREFETCH_THRESHOLD && hasMore && !fetching && !fetchError) {
      fetchMore();
    }
  }, [queue.length, hasMore, fetching, fetchError, ready, fetchMore]);

  // Publish liked list to "shared" storage so the Compare view can find it.
  useEffect(() => {
    if (!handle || !ready) return;
    const timer = setTimeout(async () => {
      try {
        await window.storage.set(
          `users:${handle.toLowerCase()}`,
          JSON.stringify({
            handle,
            liked: liked.map(a => ({
              id: a.id, title: a.title, artist: a.artist, imageSmall: a.imageSmall,
            })),
            updatedAt: Date.now(),
          }),
          true
        );
      } catch {}
    }, 400);
    return () => clearTimeout(timer);
  }, [liked, handle, ready]);

  const handleSwipe = async (direction, art) => {
    const newSeen = new Set(seenIds);
    newSeen.add(art.id);
    setSeenIds(newSeen);
    try { await window.storage.set('seen', JSON.stringify([...newSeen])); } catch {}

    if (direction === 'right' && !liked.some(a => a.id === art.id)) {
      const newLiked = [art, ...liked];
      setLiked(newLiked);
      try { await window.storage.set('liked', JSON.stringify(newLiked)); } catch {}
    }
    setQueue(q => q.filter(a => a.id !== art.id));
  };

  const removeFromLiked = async (id) => {
    const newLiked = liked.filter(a => a.id !== id);
    setLiked(newLiked);
    try { await window.storage.set('liked', JSON.stringify(newLiked)); } catch {}
  };

  const saveHandle = async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setHandle(trimmed);
    setShowHandleDialog(false);
    try { await window.storage.set('profile', JSON.stringify({ handle: trimmed, createdAt: Date.now() })); } catch {}
  };

  const resetSeen = async () => {
    // Keep liked items in seen so they don't reappear, but clear everything else.
    const keepSeen = new Set(liked.map(a => a.id));
    setSeenIds(keepSeen);
    try { await window.storage.set('seen', JSON.stringify([...keepSeen])); } catch {}
    setQueue([]);
    setPage(1);
    setHasMore(true);
    setFetchError(null);
    // Trigger a fresh fetch
    setTimeout(() => fetchMore(), 0);
  };

  const retryFetch = () => {
    setFetchError(null);
    fetchMore();
  };

  return (
    <div className="min-h-screen w-full bg-[#0a0806] font-ui text-[#f2ede4] no-select">
      <div className="mx-auto max-w-[440px] min-h-screen flex flex-col relative">
        <Header view={view} setView={setView} handle={handle} likedCount={liked.length} />
        <main className="flex-1 flex flex-col relative overflow-hidden">
          {view === 'swipe' && (
            <SwipeView
              queue={queue}
              fetching={fetching}
              fetchError={fetchError}
              hasMore={hasMore}
              onSwipe={handleSwipe}
              onRetry={retryFetch}
              onReset={resetSeen}
              onTapCard={setDetailArt}
              onShopCard={setShopArt}
              ready={ready}
            />
          )}
          {view === 'liked' && <LikedView liked={liked} onRemove={removeFromLiked} onStart={() => setView('swipe')} onShop={setShopArt} />}
          {view === 'compare' && <CompareView myHandle={handle} myLiked={liked} />}
          {view === 'profile' && (
            <ProfileView
              handle={handle}
              likedCount={liked.length}
              onChangeHandle={() => setShowHandleDialog(true)}
              onResetSeen={resetSeen}
            />
          )}
        </main>
        <TabBar view={view} setView={setView} />
        {shopArt && (
          <ShopModal art={shopArt} onClose={() => setShopArt(null)} />
        )}
        {detailArt && (
          <ArtDetailModal
            art={detailArt}
            isLiked={liked.some(a => a.id === detailArt.id)}
            onClose={() => setDetailArt(null)}
            onSwipe={(dir) => { handleSwipe(dir, detailArt); setDetailArt(null); }}
            onGoToLikes={() => { setDetailArt(null); setView('liked'); }}
          />
        )}
        {showHandleDialog && (
          <HandleDialog initial={handle || ''} onSave={saveHandle} canCancel={!!handle} onCancel={() => setShowHandleDialog(false)} />
        )}
      </div>
    </div>
  );
}

// ---------- Header ----------
function Header({ view, setView, handle, likedCount }) {
  const titles = { swipe: 'Discover', liked: 'Your Collection', compare: 'Compare', profile: 'Profile' };
  return (
    <header className="px-6 pt-5 pb-3 flex items-end justify-between border-b border-white/10">
      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-[#f2ede4]/40 font-ui">Artswipe</div>
        <h1 className="font-display text-[32px] leading-none tracking-tight italic">{titles[view]}</h1>
      </div>
      <div className="flex items-center gap-3">
        {view === 'swipe' && (
          <button onClick={() => setView('liked')} className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#f2ede4]/60 hover:text-[#b5533f] transition">
            <Heart size={14} strokeWidth={1.8} fill={likedCount > 0 ? 'currentColor' : 'none'} className={likedCount > 0 ? 'text-[#b5533f]' : ''} />
            {likedCount > 0 && <span>{likedCount}</span>}
          </button>
        )}
        {handle && (
          <button onClick={() => setView('profile')} className="text-[11px] uppercase tracking-wider text-[#f2ede4]/60 hover:text-[#f2ede4] transition">
            @{handle}
          </button>
        )}
      </div>
    </header>
  );
}

// ---------- Tab Bar ----------
function TabBar({ view, setView }) {
  const tabs = [
    { id: 'swipe', label: 'Discover', Icon: Sparkles },
    { id: 'liked', label: 'Collection', Icon: Heart },
    { id: 'compare', label: 'Compare', Icon: Users },
  ];
  return (
    <nav className="border-t border-white/10 bg-[#0a0806]/95 backdrop-blur">
      <div className="flex">
        {tabs.map(({ id, label, Icon }) => {
          const active = view === id;
          return (
            <button key={id} onClick={() => setView(id)} className={`flex-1 py-3 flex flex-col items-center gap-1 transition ${active ? 'text-[#b5533f]' : 'text-[#f2ede4]/40 hover:text-[#f2ede4]/70'}`}>
              <Icon size={19} strokeWidth={active ? 2 : 1.6} fill={id === 'liked' && active ? 'currentColor' : 'none'} />
              <span className="text-[10px] uppercase tracking-[0.15em]">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// ---------- Swipe View ----------
function SwipeView({ queue, fetching, fetchError, hasMore, onSwipe, onRetry, onReset, onTapCard, onShopCard, ready }) {
  const topThree = queue.slice(0, 3);

  const showInitialLoading = !ready || (queue.length === 0 && fetching && !fetchError);
  const showError = queue.length === 0 && fetchError;
  const showEnd = queue.length === 0 && !hasMore && !fetching && !fetchError;

  return (
    <div className="flex-1 flex flex-col p-6">
      <div className="flex-1 relative flex items-center justify-center">
        {showInitialLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <CardSkeleton />
            <div className="absolute bottom-0 text-[11px] uppercase tracking-[0.2em] text-[#f2ede4]/45 pb-2">
              Loading from {SOURCE_NAME}
            </div>
          </div>
        ) : showError ? (
          <EmptyState
            icon={<AlertCircle size={28} />}
            title="Couldn't load catalog"
            body={fetchError}
            action={{ label: 'Retry', onClick: onRetry }}
          />
        ) : showEnd ? (
          <EmptyState
            icon={<Check size={28} />}
            title="You've seen every piece"
            body="Reset your history to rediscover the catalog."
            action={{ label: 'Start fresh', onClick: onReset }}
          />
        ) : (
          topThree.slice().reverse().map((art, idx) => {
            const realIdx = topThree.length - 1 - idx;
            return <SwipeCard key={art.id} art={art} isTop={realIdx === 0} stackIndex={realIdx} onSwipe={onSwipe} onTap={onTapCard} onShop={onShopCard} />;
          })
        )}
      </div>
      {queue.length > 0 && (
        <div className="flex items-center justify-center gap-8 pt-5 pb-2">
          <ActionButton onClick={() => onSwipe('left', queue[0])} label="Pass" tone="pass"><X size={22} strokeWidth={2.2} /></ActionButton>
          <ActionButton onClick={() => onSwipe('right', queue[0])} label="Collect" tone="like"><Heart size={22} strokeWidth={2.2} fill="currentColor" /></ActionButton>
        </div>
      )}
    </div>
  );
}

function ActionButton({ children, onClick, label, tone }) {
  const styles = tone === 'like'
    ? 'bg-[#b5533f] text-[#f2ede4] hover:bg-[#9a4533]'
    : 'bg-white text-[#1a1614] hover:bg-[#f2ede4]';
  return (
    <button onClick={onClick} aria-label={label} className={`w-14 h-14 rounded-full flex items-center justify-center transition active:scale-90 shadow-sm ${styles}`}>
      {children}
    </button>
  );
}

// ---------- Swipe Card ----------
function SwipeCard({ art, isTop, stackIndex, onSwipe, onTap, onShop }) {
  const ref = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [exiting, setExiting] = useState(null);
  const [imgFailed, setImgFailed] = useState(false);
  const startRef = useRef({ x: 0, y: 0 });

  const onDown = (e) => {
    if (!isTop || exiting) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    try { ref.current?.setPointerCapture(e.pointerId); } catch {}
  };
  const onMove = (e) => {
    if (!dragging) return;
    setOffset({ x: e.clientX - startRef.current.x, y: (e.clientY - startRef.current.y) * 0.4 });
  };
  const onUp = (e) => {
    if (!dragging) return;
    setDragging(false);
    try { ref.current?.releasePointerCapture(e.pointerId); } catch {}
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    const swipeThreshold = 110;
    const tapThreshold = 8;
    if (Math.abs(dx) < tapThreshold && Math.abs(dy) < tapThreshold) {
      setOffset({ x: 0, y: 0 });
      if (isTop) onTap?.(art);
    } else if (Math.abs(dx) > swipeThreshold) {
      const dir = dx > 0 ? 'right' : 'left';
      setExiting(dir);
      setTimeout(() => onSwipe(dir, art), 280);
    } else {
      setOffset({ x: 0, y: 0 });
    }
  };

  const rotation = offset.x / 22;
  const likeOpacity = Math.max(0, Math.min(1, offset.x / 110));
  const passOpacity = Math.max(0, Math.min(1, -offset.x / 110));

  let transform;
  if (exiting === 'right') transform = `translate(140%, ${offset.y}px) rotate(28deg)`;
  else if (exiting === 'left') transform = `translate(-140%, ${offset.y}px) rotate(-28deg)`;
  else {
    const scale = 1 - stackIndex * 0.035;
    const yStack = stackIndex * 10;
    transform = `translate(${offset.x}px, ${offset.y + yStack}px) rotate(${rotation}deg) scale(${scale})`;
  }

  return (
    <div
      ref={ref}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{
        transform,
        transition: dragging ? 'none' : 'transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        touchAction: 'none',
        zIndex: 100 - stackIndex,
        opacity: stackIndex > 2 ? 0 : 1,
      }}
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
    >
      <div className="w-full h-full bg-white rounded-xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7),0_8px_20px_-6px_rgba(0,0,0,0.4)] overflow-hidden flex flex-col">
        <div className="flex-1 bg-white relative overflow-hidden flex items-center justify-center p-5">
          {imgFailed ? (
            <div className="text-center text-[#1a1614]/50 px-6">
              <div className="font-display italic text-xl mb-1">{art.title}</div>
              <div className="text-[11px] uppercase tracking-wider">Image unavailable</div>
            </div>
          ) : (
            <img
              src={art.image}
              alt={art.altText || art.title}
              draggable={false}
              loading="eager"
              className="max-w-full max-h-full object-contain shadow-[0_8px_24px_-8px_rgba(0,0,0,0.3)]"
              onError={() => setImgFailed(true)}
            />
          )}
          <div style={{ opacity: likeOpacity }} className="absolute top-6 left-6 border-2 border-[#b5533f] text-[#b5533f] px-3 py-1 rotate-[-14deg] font-display italic text-xl tracking-wide pointer-events-none bg-[#f2ede4]/80">Collect</div>
          <div style={{ opacity: passOpacity }} className="absolute top-6 right-6 border-2 border-[#1a1614] text-[#1a1614] px-3 py-1 rotate-[14deg] font-display italic text-xl tracking-wide pointer-events-none bg-[#f2ede4]/80">Pass</div>
          {isTop && (
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onShop?.(art); }}
              aria-label="Shop this print"
              className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-[#0a0806]/65 backdrop-blur-sm flex items-center justify-center hover:bg-[#0a0806]/90 transition"
            >
              <ShoppingBag size={16} color="#f2ede4" strokeWidth={1.8} />
            </button>
          )}
        </div>
        <div className="px-5 py-4 border-t border-[#1a1614]/8 bg-white">
          <div className="font-display text-[19px] leading-tight italic">{art.title}</div>
          <div className="text-[11px] uppercase tracking-[0.15em] text-[#1a1614]/65 mt-1 line-clamp-1">{art.artist}</div>
          {(art.date || art.classification) && (
            <div className="text-[11px] text-[#1a1614]/50 mt-1 flex gap-2">
              {art.date && <span>{art.date}</span>}
              {art.date && art.classification && <span>·</span>}
              {art.classification && <span className="capitalize">{art.classification}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Print Marketplaces ----------
const MARKETPLACES = [
  {
    id: 'fineartamerica',
    name: 'Fine Art America',
    domain: 'fineartamerica.com',
    color: '#1C3557',
    priceFrom: 22,
    sizes: [{ h: 8, w: 10 }, { h: 12, w: 16 }, { h: 18, w: 24 }, { h: 24, w: 36 }],
    getUrl: (art) => `https://fineartamerica.com/search.html?q=${encodeURIComponent(`${art.title} ${art.artist.split('\n')[0]}`)}`,
  },
  {
    id: 'artcom',
    name: 'Art.com',
    domain: 'art.com',
    color: '#8B1A1A',
    priceFrom: 14,
    sizes: [{ h: 5, w: 7 }, { h: 11, w: 14 }, { h: 16, w: 20 }, { h: 24, w: 36 }],
    getUrl: (art) => `https://www.art.com/gallery/id--a/posters.htm?usp=search&q=${encodeURIComponent(art.title)}`,
  },
  {
    id: 'allposters',
    name: 'AllPosters',
    domain: 'allposters.com',
    color: '#2C4A7C',
    priceFrom: 10,
    sizes: [{ h: 8, w: 10 }, { h: 11, w: 14 }, { h: 16, w: 20 }, { h: 24, w: 32 }],
    getUrl: (art) => `https://www.allposters.com/Search/SAll/?k=${encodeURIComponent(`${art.title} ${art.artist.split('\n')[0]}`)}`,
  },
  {
    id: 'redbubble',
    name: 'Redbubble',
    domain: 'redbubble.com',
    color: '#B7175A',
    priceFrom: 15,
    sizes: [{ h: 4, w: 6 }, { h: 8, w: 10 }, { h: 12, w: 16 }, { h: 18, w: 24 }],
    getUrl: (art) => `https://www.redbubble.com/shop/?query=${encodeURIComponent(`${art.title} ${art.artist.split('\n')[0]}`)}&ref=search_box`,
  },
  {
    id: 'society6',
    name: 'Society6',
    domain: 'society6.com',
    color: '#1A1A2E',
    priceFrom: 20,
    sizes: [{ h: 6, w: 8 }, { h: 10, w: 12 }, { h: 14, w: 18 }, { h: 20, w: 26 }],
    getUrl: (art) => `https://society6.com/s?q=${encodeURIComponent(`${art.title} ${art.artist.split('\n')[0]}`)}`,
  },
  {
    id: 'etsy',
    name: 'Etsy',
    domain: 'etsy.com',
    color: '#BF5700',
    priceFrom: 12,
    sizes: [{ h: 5, w: 7 }, { h: 8, w: 10 }, { h: 11, w: 14 }, { h: 16, w: 20 }],
    getUrl: (art) => `https://www.etsy.com/search?q=${encodeURIComponent(`${art.title} ${art.artist.split('\n')[0]} print`)}`,
  },
];

// ---------- Shop Modal ----------
function ShopModal({ art, onClose }) {
  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: 'rgba(6,4,3,0.96)' }}>
      {/* header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/10 flex-shrink-0">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-[#f2ede4]/40 mb-0.5">Buy a print</div>
          <div className="font-display italic text-lg leading-tight line-clamp-1">{art.title}</div>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow flex-shrink-0 ml-4 hover:bg-[#f2ede4] transition"
          aria-label="Close"
        >
          <X size={18} color="#1a1614" strokeWidth={2.5} />
        </button>
      </div>

      {/* marketplace grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[#f2ede4]/35 mb-4 text-center">
          Select a retailer to search for this print
        </p>
        <div className="grid grid-cols-2 gap-3">
          {MARKETPLACES.map((site) => (
            <a
              key={site.id}
              href={site.getUrl(art)}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col rounded-xl overflow-hidden bg-[#1a1614] hover:ring-2 hover:ring-white/30 transition"
            >
              {/* thumbnail */}
              <div
                className="h-24 flex flex-col items-center justify-center gap-2 relative"
                style={{ background: site.color }}
              >
                <img
                  src={`https://www.google.com/s2/favicons?domain=${site.domain}&sz=64`}
                  alt={site.name}
                  className="w-10 h-10 rounded-lg shadow"
                  onError={e => { e.target.style.display = 'none'; }}
                />
                <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition">
                  <ExternalLink size={12} color="rgba(255,255,255,0.7)" />
                </div>
              </div>

              {/* info */}
              <div className="p-3 flex flex-col gap-1.5">
                <div className="text-[12px] font-medium text-[#f2ede4] leading-tight">{site.name}</div>
                <div className="text-[11px] text-[#f2ede4]/50">From ${site.priceFrom}</div>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {site.sizes.map((s) => (
                    <span key={`${s.h}x${s.w}`} className="text-[9px] uppercase tracking-wide bg-white/8 text-[#f2ede4]/55 px-1.5 py-0.5 rounded">
                      {s.h}×{s.w}"
                    </span>
                  ))}
                </div>
              </div>
            </a>
          ))}
        </div>
        <p className="text-[9px] text-[#f2ede4]/25 text-center mt-6 leading-relaxed px-4">
          Prices and availability may vary. Links open a search for this artwork on each retailer's site.
        </p>
      </div>
    </div>
  );
}

// ---------- Art Detail Modal ----------
function ArtDetailModal({ art, isLiked, onClose, onSwipe, onGoToLikes }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col" style={{ background: 'rgba(6,4,3,0.93)' }}>
      {/* clicking the top/image area closes the modal */}
      <div className="flex-1 flex flex-col cursor-pointer" onClick={onClose}>
        {/* close button — large and obvious */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow transition hover:bg-[#f2ede4]"
            aria-label="Close"
          >
            <X size={18} color="#1a1614" strokeWidth={2.5} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onGoToLikes(); }}
            className="flex items-center gap-2 bg-white hover:bg-[#f2ede4] text-[#1a1614] text-[11px] uppercase tracking-wider px-4 py-2 rounded-full shadow transition"
          >
            <Heart size={13} fill={isLiked ? 'currentColor' : 'none'} className={isLiked ? 'text-[#b5533f]' : ''} />
            My Collection
          </button>
        </div>

        {/* image inside a white museum mat — clicking anywhere here also closes */}
        <div className="flex-1 flex items-center justify-center px-6 py-3 min-h-0">
          {imgFailed ? (
            <div className="text-center text-white/60 px-6">
              <div className="font-display italic text-xl mb-1">{art.title}</div>
              <div className="text-[11px] uppercase tracking-wider">Image unavailable</div>
            </div>
          ) : (
            <div className="bg-white p-4 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8)] flex items-center justify-center max-h-full pointer-events-none">
              <img
                src={art.image}
                alt={art.altText || art.title}
                draggable={false}
                style={{ maxHeight: 'calc(100vh - 340px)' }}
                className="max-w-full object-contain"
                onError={() => setImgFailed(true)}
              />
            </div>
          )}
        </div>

        <p className="text-center text-white/30 text-[10px] uppercase tracking-widest pb-3">
          Click anywhere above to close
        </p>
      </div>

      {/* info + actions — does NOT close modal when clicked */}
      <div className="bg-[#f2ede4] rounded-t-2xl px-6 pt-5 pb-8 mx-auto w-full max-w-[440px]" onClick={e => e.stopPropagation()}>
        <div className="font-display italic text-2xl leading-tight mb-1">{art.title}</div>
        <div className="text-[11px] uppercase tracking-[0.15em] text-[#1a1614]/65 mb-2">{art.artist}</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#1a1614]/50 mb-1">
          {art.date && <span>{art.date}</span>}
          {art.classification && <span className="capitalize">{art.classification}</span>}
          {art.origin && <span>{art.origin}</span>}
        </div>
        {art.medium && <div className="text-[11px] text-[#1a1614]/45 italic mb-3">{art.medium}</div>}
        {art.sourceUrl && (
          <a href={art.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] uppercase tracking-[0.18em] text-[#1a1614]/40 hover:text-[#1a1614]/70 transition mb-4 block">
            View at {art.source} ↗
          </a>
        )}
        <div className="flex gap-3 mt-2">
          <button onClick={() => onSwipe('left')} className="flex-1 py-3 border border-[#1a1614]/20 rounded-full text-xs uppercase tracking-[0.15em] hover:border-[#1a1614]/50 transition flex items-center justify-center gap-2">
            <X size={14} /> Pass
          </button>
          <button onClick={() => onSwipe('right')} className="flex-1 py-3 bg-[#b5533f] text-[#f2ede4] rounded-full text-xs uppercase tracking-[0.15em] hover:bg-[#9a4533] transition flex items-center justify-center gap-2">
            <Heart size={14} fill="currentColor" /> Collect
          </button>
        </div>
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="w-full h-full max-w-full rounded-xl overflow-hidden bg-white shadow-[0_20px_50px_-20px_rgba(26,22,20,0.35)]">
      <div className="h-[72%] shimmer" />
      <div className="p-5 space-y-2">
        <div className="h-4 w-3/4 shimmer rounded" />
        <div className="h-3 w-1/2 shimmer rounded" />
      </div>
    </div>
  );
}

function EmptyState({ icon, title, body, action }) {
  return (
    <div className="text-center fade-up max-w-[280px]">
      <div className="w-14 h-14 rounded-full bg-white/10 mx-auto flex items-center justify-center text-[#f2ede4]/60 mb-4">{icon}</div>
      <div className="font-display italic text-2xl mb-2">{title}</div>
      <p className="text-sm text-[#f2ede4]/60 leading-relaxed mb-5 break-words">{body}</p>
      {action && (
        <button onClick={action.onClick} className="px-5 py-2.5 bg-white text-[#1a1614] text-xs uppercase tracking-[0.2em] rounded-full hover:bg-[#f2ede4] transition">
          {action.label}
        </button>
      )}
    </div>
  );
}

// ---------- Liked View ----------
function LikedView({ liked, onRemove, onStart, onShop }) {
  if (liked.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <EmptyState icon={<Heart size={26} />} title="Nothing collected yet" body="Swipe right on pieces that move you. They'll live here." action={{ label: 'Start swiping', onClick: onStart }} />
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="text-[11px] uppercase tracking-[0.2em] text-[#f2ede4]/45 mb-4">
        {liked.length} {liked.length === 1 ? 'piece' : 'pieces'}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {liked.map((art, i) => (
          <div key={art.id} className="group relative fade-up" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
            <div className="aspect-[3/4] bg-white rounded-lg overflow-hidden flex items-center justify-center p-2 shadow-[0_8px_24px_-6px_rgba(0,0,0,0.5)] relative">
              <img src={art.imageSmall || art.image} alt={art.title} className="max-w-full max-h-full object-contain" />
              <button
                onClick={() => onShop?.(art)}
                aria-label="Shop this print"
                className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-[#0a0806]/65 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-[#0a0806]/90 transition"
              >
                <ShoppingBag size={13} color="#f2ede4" strokeWidth={1.8} />
              </button>
            </div>
            <div className="mt-2">
              <div className="font-display italic text-[14px] leading-tight line-clamp-2">{art.title}</div>
              <div className="text-[10px] uppercase tracking-wider text-[#f2ede4]/50 mt-0.5 line-clamp-1">{art.artist}</div>
            </div>
            <button onClick={() => onRemove(art.id)} aria-label="Remove" className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-[#1a1614]/80 backdrop-blur text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:text-[#b5533f] transition">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Compare View ----------
function CompareView({ myHandle, myLiked }) {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const runCompare = async () => {
    const target = input.trim().replace(/^@/, '');
    if (!target) return;
    if (target.toLowerCase() === myHandle?.toLowerCase()) {
      setResult({ error: "That's you. Try a friend's handle." });
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const r = await window.storage.get(`users:${target.toLowerCase()}`, true);
      if (!r?.value) {
        setResult({ notFound: true, handle: target });
      } else {
        const other = JSON.parse(r.value);
        const mine = new Map(myLiked.map(a => [a.id, a]));
        const mutual = other.liked.filter(a => mine.has(a.id)).map(a => mine.get(a.id));
        setResult({ handle: other.handle, mutual, theirCount: other.liked.length, myCount: myLiked.length });
      }
    } catch {
      setResult({ notFound: true, handle: target });
    } finally {
      setLoading(false);
    }
  };

  const copyHandle = async () => {
    try {
      await navigator.clipboard.writeText(myHandle);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="bg-white/8 border border-white/12 rounded-lg p-4 mb-5">
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#f2ede4]/45 mb-1">Your handle</div>
        <div className="flex items-center justify-between">
          <div className="font-display italic text-xl">@{myHandle}</div>
          <button onClick={copyHandle} className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-full border border-white/25 hover:border-white/60 transition">
            {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Share</>}
          </button>
        </div>
        <p className="text-xs text-[#f2ede4]/45 mt-2 leading-relaxed">
          Share with someone to compare taste. Note: this prototype stores shared data in localStorage, so compare only works between handles on the same browser. See README for how to add a real backend.
        </p>
      </div>

      <div className="text-[10px] uppercase tracking-[0.2em] text-[#f2ede4]/45 mb-2">Find a friend</div>
      <div className="flex gap-2 mb-6">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1a1614]/40 font-display italic">@</span>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && runCompare()} placeholder="friend's handle" className="w-full pl-7 pr-3 py-3 bg-white text-[#1a1614] border border-transparent rounded-lg focus:outline-none focus:border-[#b5533f] transition font-ui text-sm" />
        </div>
        <button onClick={runCompare} disabled={loading || !input.trim()} className="px-5 py-3 bg-white text-[#1a1614] text-xs uppercase tracking-[0.15em] rounded-lg hover:bg-[#f2ede4] transition disabled:opacity-40">
          {loading ? '...' : 'Compare'}
        </button>
      </div>

      {result && result.error && <div className="text-sm text-[#f2ede4]/60 text-center py-4 fade-up">{result.error}</div>}

      {result && result.notFound && (
        <div className="text-center py-8 fade-up">
          <div className="font-display italic text-xl mb-1">No collection for @{result.handle}</div>
          <p className="text-sm text-[#f2ede4]/55">They might not have swiped yet, or the handle is off.</p>
        </div>
      )}

      {result && !result.notFound && !result.error && (
        <div className="fade-up">
          <div className="flex items-baseline justify-between mb-1">
            <div className="font-display italic text-2xl">{result.mutual.length} in common</div>
            <div className="text-[11px] uppercase tracking-wider text-[#f2ede4]/45">with @{result.handle}</div>
          </div>
          <div className="text-xs text-[#f2ede4]/45 mb-5">You have {result.myCount} · they have {result.theirCount}</div>
          {result.mutual.length === 0 ? (
            <div className="text-center py-6 bg-white/8 rounded-lg border border-white/12">
              <div className="font-display italic text-lg mb-1">Different tastes</div>
              <p className="text-sm text-[#f2ede4]/55">No overlap yet — keep swiping.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {result.mutual.map((art, i) => (
                <div key={art.id} className="fade-up" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                  <div className="aspect-[3/4] bg-white rounded-lg overflow-hidden flex items-center justify-center p-2 relative shadow-[0_8px_24px_-6px_rgba(0,0,0,0.5)]">
                    <img src={art.imageSmall || art.image} alt={art.title} className="max-w-full max-h-full object-contain" />
                    <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-[#b5533f] text-white flex items-center justify-center">
                      <Heart size={11} fill="currentColor" />
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="font-display italic text-[14px] leading-tight line-clamp-2">{art.title}</div>
                    <div className="text-[10px] uppercase tracking-wider text-[#f2ede4]/50 mt-0.5 line-clamp-1">{art.artist}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Profile View ----------
function ProfileView({ handle, likedCount, onChangeHandle, onResetSeen }) {
  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="bg-white/8 border border-white/12 rounded-lg p-5 mb-5">
        <div className="w-16 h-16 rounded-full bg-white text-[#1a1614] flex items-center justify-center font-display italic text-2xl mb-3">
          {handle?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="font-display italic text-2xl">@{handle}</div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#f2ede4]/45 mt-1">
          {likedCount} {likedCount === 1 ? 'piece collected' : 'pieces collected'}
        </div>
      </div>
      <div className="space-y-1">
        <SettingRow label="Change handle" sublabel="This is how friends find you" onClick={onChangeHandle} />
        <SettingRow label="Reset seen history" sublabel="Rediscover pieces you've passed on" onClick={onResetSeen} destructive />
      </div>
      <p className="text-xs text-[#f2ede4]/35 leading-relaxed mt-8 text-center">
        Artwork from {SOURCE_NAME}.
      </p>
    </div>
  );
}

function SettingRow({ label, sublabel, onClick, destructive }) {
  return (
    <button onClick={onClick} className="w-full text-left p-4 bg-white/8 hover:bg-white/15 border border-white/12 rounded-lg transition">
      <div className={`text-sm font-medium ${destructive ? 'text-[#b5533f]' : 'text-[#f2ede4]'}`}>{label}</div>
      <div className="text-xs text-[#f2ede4]/45 mt-0.5">{sublabel}</div>
    </button>
  );
}

// ---------- Handle Dialog ----------
function HandleDialog({ initial, onSave, canCancel, onCancel }) {
  const [value, setValue] = useState(initial);
  const valid = /^[a-zA-Z0-9_]{2,20}$/.test(value.trim());
  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-6 z-50">
      <div className="bg-[#f2ede4] text-[#1a1614] rounded-xl p-6 max-w-[360px] w-full fade-up">
        <div className="text-[10px] uppercase tracking-[0.22em] text-[#1a1614]/55 mb-1">{initial ? 'Change your handle' : 'Welcome'}</div>
        <h2 className="font-display italic text-3xl leading-tight mb-2">Pick a handle</h2>
        <p className="text-sm text-[#1a1614]/60 mb-5 leading-relaxed">
          Friends use this to find you and compare collections. Letters, numbers, and underscores only.
        </p>
        <div className="relative mb-5">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1a1614]/40 font-display italic">@</span>
          <input autoFocus value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && valid && onSave(value)} placeholder="yourhandle" className="w-full pl-7 pr-3 py-3 bg-white border border-[#1a1614]/15 rounded-lg focus:outline-none focus:border-[#1a1614]/50 transition font-ui" />
        </div>
        <div className="flex gap-2">
          {canCancel && (
            <button onClick={onCancel} className="flex-1 py-3 border border-[#1a1614]/20 rounded-lg text-xs uppercase tracking-wider hover:border-[#1a1614]/50 transition">Cancel</button>
          )}
          <button onClick={() => onSave(value)} disabled={!valid} className="flex-1 py-3 bg-[#1a1614] text-[#f2ede4] rounded-lg text-xs uppercase tracking-[0.15em] hover:bg-[#2a2420] transition disabled:opacity-40">
            {initial ? 'Save' : "Let's go"}
          </button>
        </div>
      </div>
    </div>
  );
}
