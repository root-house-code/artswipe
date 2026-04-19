import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Heart, X, Users, Sparkles, Check, Copy, RefreshCw, AlertCircle } from 'lucide-react';

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
    <div className="min-h-screen w-full bg-[#f2ede4] font-ui text-[#1a1614] no-select">
      <div className="mx-auto max-w-[440px] min-h-screen flex flex-col relative">
        <Header view={view} setView={setView} handle={handle} />
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
              ready={ready}
            />
          )}
          {view === 'liked' && <LikedView liked={liked} onRemove={removeFromLiked} onStart={() => setView('swipe')} />}
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
        {showHandleDialog && (
          <HandleDialog initial={handle || ''} onSave={saveHandle} canCancel={!!handle} onCancel={() => setShowHandleDialog(false)} />
        )}
      </div>
    </div>
  );
}

// ---------- Header ----------
function Header({ view, setView, handle }) {
  const titles = { swipe: 'Discover', liked: 'Your Collection', compare: 'Compare', profile: 'Profile' };
  return (
    <header className="px-6 pt-5 pb-3 flex items-end justify-between border-b border-[#1a1614]/10">
      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-[#1a1614]/50 font-ui">Artswipe</div>
        <h1 className="font-display text-[32px] leading-none tracking-tight italic">{titles[view]}</h1>
      </div>
      {handle && (
        <button onClick={() => setView('profile')} className="text-[11px] uppercase tracking-wider text-[#1a1614]/60 hover:text-[#1a1614] transition">
          @{handle}
        </button>
      )}
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
    <nav className="border-t border-[#1a1614]/10 bg-[#f2ede4]/95 backdrop-blur">
      <div className="flex">
        {tabs.map(({ id, label, Icon }) => {
          const active = view === id;
          return (
            <button key={id} onClick={() => setView(id)} className={`flex-1 py-3 flex flex-col items-center gap-1 transition ${active ? 'text-[#b5533f]' : 'text-[#1a1614]/55 hover:text-[#1a1614]'}`}>
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
function SwipeView({ queue, fetching, fetchError, hasMore, onSwipe, onRetry, onReset, ready }) {
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
            <div className="absolute bottom-0 text-[11px] uppercase tracking-[0.2em] text-[#1a1614]/45 pb-2">
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
            return <SwipeCard key={art.id} art={art} isTop={realIdx === 0} stackIndex={realIdx} onSwipe={onSwipe} />;
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
    : 'bg-[#f2ede4] text-[#1a1614] border border-[#1a1614]/20 hover:border-[#1a1614]/40';
  return (
    <button onClick={onClick} aria-label={label} className={`w-14 h-14 rounded-full flex items-center justify-center transition active:scale-90 shadow-sm ${styles}`}>
      {children}
    </button>
  );
}

// ---------- Swipe Card ----------
function SwipeCard({ art, isTop, stackIndex, onSwipe }) {
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
    const threshold = 110;
    if (Math.abs(offset.x) > threshold) {
      const dir = offset.x > 0 ? 'right' : 'left';
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
      <div className="w-full h-full bg-white rounded-xl shadow-[0_20px_50px_-20px_rgba(26,22,20,0.35),0_4px_12px_-4px_rgba(26,22,20,0.15)] overflow-hidden flex flex-col">
        <div className="flex-1 bg-[#ebe4d6] relative overflow-hidden flex items-center justify-center p-5">
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
      <div className="w-14 h-14 rounded-full bg-[#1a1614]/5 mx-auto flex items-center justify-center text-[#1a1614]/60 mb-4">{icon}</div>
      <div className="font-display italic text-2xl mb-2">{title}</div>
      <p className="text-sm text-[#1a1614]/60 leading-relaxed mb-5 break-words">{body}</p>
      {action && (
        <button onClick={action.onClick} className="px-5 py-2.5 bg-[#1a1614] text-[#f2ede4] text-xs uppercase tracking-[0.2em] rounded-full hover:bg-[#2a2420] transition">
          {action.label}
        </button>
      )}
    </div>
  );
}

// ---------- Liked View ----------
function LikedView({ liked, onRemove, onStart }) {
  if (liked.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <EmptyState icon={<Heart size={26} />} title="Nothing collected yet" body="Swipe right on pieces that move you. They'll live here." action={{ label: 'Start swiping', onClick: onStart }} />
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="text-[11px] uppercase tracking-[0.2em] text-[#1a1614]/55 mb-4">
        {liked.length} {liked.length === 1 ? 'piece' : 'pieces'}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {liked.map((art, i) => (
          <div key={art.id} className="group relative fade-up" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
            <div className="aspect-[3/4] bg-[#ebe4d6] rounded-lg overflow-hidden flex items-center justify-center p-2">
              <img src={art.imageSmall || art.image} alt={art.title} className="max-w-full max-h-full object-contain" />
            </div>
            <div className="mt-2">
              <div className="font-display italic text-[14px] leading-tight line-clamp-2">{art.title}</div>
              <div className="text-[10px] uppercase tracking-wider text-[#1a1614]/55 mt-0.5 line-clamp-1">{art.artist}</div>
            </div>
            <button onClick={() => onRemove(art.id)} aria-label="Remove" className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/90 backdrop-blur text-[#1a1614]/70 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:text-[#b5533f] transition">
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
      <div className="bg-white/60 border border-[#1a1614]/10 rounded-lg p-4 mb-5">
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#1a1614]/55 mb-1">Your handle</div>
        <div className="flex items-center justify-between">
          <div className="font-display italic text-xl">@{myHandle}</div>
          <button onClick={copyHandle} className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-full border border-[#1a1614]/20 hover:border-[#1a1614]/50 transition">
            {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Share</>}
          </button>
        </div>
        <p className="text-xs text-[#1a1614]/55 mt-2 leading-relaxed">
          Share with someone to compare taste. Note: this prototype stores shared data in localStorage, so compare only works between handles on the same browser. See README for how to add a real backend.
        </p>
      </div>

      <div className="text-[10px] uppercase tracking-[0.2em] text-[#1a1614]/55 mb-2">Find a friend</div>
      <div className="flex gap-2 mb-6">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1a1614]/40 font-display italic">@</span>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && runCompare()} placeholder="friend's handle" className="w-full pl-7 pr-3 py-3 bg-white border border-[#1a1614]/15 rounded-lg focus:outline-none focus:border-[#1a1614]/50 transition font-ui text-sm" />
        </div>
        <button onClick={runCompare} disabled={loading || !input.trim()} className="px-5 py-3 bg-[#1a1614] text-[#f2ede4] text-xs uppercase tracking-[0.15em] rounded-lg hover:bg-[#2a2420] transition disabled:opacity-40">
          {loading ? '...' : 'Compare'}
        </button>
      </div>

      {result && result.error && <div className="text-sm text-[#1a1614]/60 text-center py-4 fade-up">{result.error}</div>}

      {result && result.notFound && (
        <div className="text-center py-8 fade-up">
          <div className="font-display italic text-xl mb-1">No collection for @{result.handle}</div>
          <p className="text-sm text-[#1a1614]/55">They might not have swiped yet, or the handle is off.</p>
        </div>
      )}

      {result && !result.notFound && !result.error && (
        <div className="fade-up">
          <div className="flex items-baseline justify-between mb-1">
            <div className="font-display italic text-2xl">{result.mutual.length} in common</div>
            <div className="text-[11px] uppercase tracking-wider text-[#1a1614]/55">with @{result.handle}</div>
          </div>
          <div className="text-xs text-[#1a1614]/55 mb-5">You have {result.myCount} · they have {result.theirCount}</div>
          {result.mutual.length === 0 ? (
            <div className="text-center py-6 bg-white/50 rounded-lg border border-[#1a1614]/10">
              <div className="font-display italic text-lg mb-1">Different tastes</div>
              <p className="text-sm text-[#1a1614]/55">No overlap yet — keep swiping.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {result.mutual.map((art, i) => (
                <div key={art.id} className="fade-up" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                  <div className="aspect-[3/4] bg-[#ebe4d6] rounded-lg overflow-hidden flex items-center justify-center p-2 relative">
                    <img src={art.imageSmall || art.image} alt={art.title} className="max-w-full max-h-full object-contain" />
                    <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-[#b5533f] text-white flex items-center justify-center">
                      <Heart size={11} fill="currentColor" />
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="font-display italic text-[14px] leading-tight line-clamp-2">{art.title}</div>
                    <div className="text-[10px] uppercase tracking-wider text-[#1a1614]/55 mt-0.5 line-clamp-1">{art.artist}</div>
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
      <div className="bg-white/60 border border-[#1a1614]/10 rounded-lg p-5 mb-5">
        <div className="w-16 h-16 rounded-full bg-[#1a1614] text-[#f2ede4] flex items-center justify-center font-display italic text-2xl mb-3">
          {handle?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="font-display italic text-2xl">@{handle}</div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#1a1614]/55 mt-1">
          {likedCount} {likedCount === 1 ? 'piece collected' : 'pieces collected'}
        </div>
      </div>
      <div className="space-y-1">
        <SettingRow label="Change handle" sublabel="This is how friends find you" onClick={onChangeHandle} />
        <SettingRow label="Reset seen history" sublabel="Rediscover pieces you've passed on" onClick={onResetSeen} destructive />
      </div>
      <p className="text-xs text-[#1a1614]/45 leading-relaxed mt-8 text-center">
        Artwork from {SOURCE_NAME}.
      </p>
    </div>
  );
}

function SettingRow({ label, sublabel, onClick, destructive }) {
  return (
    <button onClick={onClick} className="w-full text-left p-4 bg-white/60 hover:bg-white border border-[#1a1614]/10 rounded-lg transition">
      <div className={`text-sm font-medium ${destructive ? 'text-[#b5533f]' : 'text-[#1a1614]'}`}>{label}</div>
      <div className="text-xs text-[#1a1614]/55 mt-0.5">{sublabel}</div>
    </button>
  );
}

// ---------- Handle Dialog ----------
function HandleDialog({ initial, onSave, canCancel, onCancel }) {
  const [value, setValue] = useState(initial);
  const valid = /^[a-zA-Z0-9_]{2,20}$/.test(value.trim());
  return (
    <div className="fixed inset-0 bg-[#1a1614]/50 backdrop-blur-sm flex items-center justify-center p-6 z-50">
      <div className="bg-[#f2ede4] rounded-xl p-6 max-w-[360px] w-full fade-up">
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
