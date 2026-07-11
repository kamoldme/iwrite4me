document.addEventListener('DOMContentLoaded', () => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('[data-aos]').forEach(el => observer.observe(el));

  const rotatingProjectWord = document.getElementById('rotating-project-word');
  const projectWords = ['book', 'essay', 'thesis', 'novel', 'chapter', 'draft', 'story', 'memoir'];
  if (rotatingProjectWord) {
    let projectWordIndex = 0;
    let projectTypingTimer = null;
    const typeProjectWord = (nextWord) => {
      window.clearTimeout(projectTypingTimer);
      const currentWord = rotatingProjectWord.textContent || '';
      let deleteIndex = currentWord.length;
      let typeIndex = 0;

      const deleteStep = () => {
        if (deleteIndex > 0) {
          deleteIndex -= 1;
          rotatingProjectWord.textContent = currentWord.slice(0, deleteIndex);
          projectTypingTimer = window.setTimeout(deleteStep, 42);
          return;
        }
        projectTypingTimer = window.setTimeout(typeStep, 120);
      };

      const typeStep = () => {
        if (typeIndex < nextWord.length) {
          typeIndex += 1;
          rotatingProjectWord.textContent = nextWord.slice(0, typeIndex);
          projectTypingTimer = window.setTimeout(typeStep, 74);
        }
      };

      deleteStep();
    };

    window.setInterval(() => {
      projectWordIndex = (projectWordIndex + 1) % projectWords.length;
      typeProjectWord(projectWords[projectWordIndex]);
    }, 3000);
  }

  const trialModal = document.getElementById('trial-writing-modal');
  const trialOpen = document.getElementById('try-writing-here');
  const trialClose = document.getElementById('trial-close');
  const trialArea = document.getElementById('trial-writing-area');
  const trialTimer = document.getElementById('trial-timer');
  const trialWordCount = document.getElementById('trial-word-count');
  const trialLock = document.getElementById('trial-lock');
  const trialCopy = document.getElementById('trial-copy');
  let trialStarted = false;
  let trialLocked = false;
  let trialSecondsLeft = 60;
  let trialInterval = null;

  function countTrialWords() {
    if (!trialArea) return 0;
    return trialArea.value.trim().split(/\s+/).filter(Boolean).length;
  }

  function updateTrialMeta() {
    if (trialWordCount) {
      const words = countTrialWords();
      trialWordCount.textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
    }
    if (trialTimer) {
      const minutes = Math.floor(trialSecondsLeft / 60);
      const seconds = String(trialSecondsLeft % 60).padStart(2, '0');
      trialTimer.textContent = `${String(minutes).padStart(2, '0')}:${seconds}`;
    }
  }

  function lockTrial() {
    if (trialLocked) return;
    trialLocked = true;
    if (trialInterval) window.clearInterval(trialInterval);
    if (trialArea) trialArea.readOnly = true;
    if (trialLock) trialLock.setAttribute('aria-hidden', 'false');
  }

  function startTrialTimer() {
    if (trialStarted || trialLocked) return;
    trialStarted = true;
    trialInterval = window.setInterval(() => {
      trialSecondsLeft -= 1;
      updateTrialMeta();
      if (trialSecondsLeft <= 0) lockTrial();
    }, 1000);
  }

  function resetTrial() {
    trialStarted = false;
    trialLocked = false;
    trialSecondsLeft = 60;
    if (trialInterval) window.clearInterval(trialInterval);
    trialInterval = null;
    if (trialArea) {
      trialArea.value = '';
      trialArea.readOnly = false;
    }
    if (trialLock) trialLock.setAttribute('aria-hidden', 'true');
    updateTrialMeta();
  }

  function openTrial() {
    if (!trialModal) return;
    resetTrial();
    trialModal.classList.add('active');
    trialModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('trial-open');
    window.setTimeout(() => trialArea?.focus(), 80);
  }

  function closeTrial() {
    if (!trialModal) return;
    trialModal.classList.remove('active');
    trialModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('trial-open');
    if (trialInterval) window.clearInterval(trialInterval);
  }

  if (trialOpen) {
    trialOpen.addEventListener('click', () => {
      window.location.href = '/app?intent=try-writing';
    });
  }
  if (trialClose) trialClose.addEventListener('click', closeTrial);
  if (trialModal) {
    trialModal.addEventListener('click', (event) => {
      if (event.target === trialModal) closeTrial();
    });
  }
  if (trialArea) {
    trialArea.addEventListener('input', () => {
      startTrialTimer();
      updateTrialMeta();
      if (countTrialWords() >= 120) lockTrial();
    });
  }
  if (trialCopy) {
    trialCopy.addEventListener('click', async () => {
      const text = trialArea?.value || '';
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        trialCopy.textContent = 'Copied';
        window.setTimeout(() => { trialCopy.textContent = 'Copy my text'; }, 1400);
      } catch {
        trialArea?.select();
      }
    });
  }
  updateTrialMeta();

  const dreamToggle = document.getElementById('dream-style-toggle');
  const dreamStorageKey = 'iwrite_landing_design';
  const setDreamLanding = (enabled) => {
    document.body.classList.toggle('dream-landing', enabled);
    if (dreamToggle) {
      dreamToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      const label = dreamToggle.querySelector('span');
      if (label) label.textContent = enabled ? 'Classic Style' : 'Dream Style';
    }
    window.dispatchEvent(new CustomEvent('landing-style-change'));
  };

  const requestedLandingDesign = new URLSearchParams(window.location.search).get('style');
  const savedLandingDesign = localStorage.getItem(dreamStorageKey);
  setDreamLanding(requestedLandingDesign !== 'classic' && savedLandingDesign !== 'classic');

  if (dreamToggle) {
    dreamToggle.addEventListener('click', () => {
      const enabled = !document.body.classList.contains('dream-landing');
      setDreamLanding(enabled);
      localStorage.setItem(dreamStorageKey, enabled ? 'dream' : 'classic');
    });
  }

  // Toggle scrolled state on landing nav for gradient blur background
  const landingNav = document.querySelector('body.landing .nav');
  if (landingNav) {
    const updateNavScrolled = () => {
      if (window.scrollY > 20) landingNav.classList.add('scrolled');
      else landingNav.classList.remove('scrolled');
    };
    updateNavScrolled();
    window.addEventListener('scroll', updateNavScrolled, { passive: true });
  }

  const writerVideoPlayer = document.querySelector('[data-writer-video-player]');
  if (writerVideoPlayer) {
    const writerVideo = writerVideoPlayer.querySelector('video');
    const writerVideoPlay = writerVideoPlayer.querySelector('.writer-video-play');
    const writerVideoProgress = writerVideoPlayer.querySelector('.writer-video-progress');
    const writerVideoProgressFill = writerVideoProgress?.querySelector('span');

    const updateWriterVideoProgress = () => {
      if (!writerVideo || !writerVideoProgressFill || !Number.isFinite(writerVideo.duration) || writerVideo.duration <= 0) return;
      const progress = Math.min(100, Math.max(0, (writerVideo.currentTime / writerVideo.duration) * 100));
      writerVideoProgressFill.style.width = `${progress}%`;
    };

    const toggleWriterVideo = () => {
      if (!writerVideo) return;
      if (writerVideo.paused || writerVideo.ended) {
        writerVideo.play().catch(() => {});
      } else {
        writerVideo.pause();
      }
    };

    writerVideoPlay?.addEventListener('click', toggleWriterVideo);
    writerVideo?.addEventListener('click', toggleWriterVideo);
    writerVideo?.addEventListener('play', () => {
      writerVideoPlayer.classList.add('has-played', 'is-playing');
    });
    writerVideo?.addEventListener('pause', () => {
      writerVideoPlayer.classList.remove('is-playing');
    });
    writerVideo?.addEventListener('ended', () => {
      writerVideoPlayer.classList.remove('is-playing');
      updateWriterVideoProgress();
    });
    writerVideo?.addEventListener('timeupdate', updateWriterVideoProgress);
    writerVideo?.addEventListener('loadedmetadata', updateWriterVideoProgress);
    writerVideoProgress?.addEventListener('click', (event) => {
      if (!writerVideo || !Number.isFinite(writerVideo.duration) || writerVideo.duration <= 0) return;
      const rect = writerVideoProgress.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      writerVideo.currentTime = ratio * writerVideo.duration;
      updateWriterVideoProgress();
    });
  }

  const writerNotesSection = document.querySelector('.writer-notes-section');
  if (writerNotesSection) {
    const updateWriterNotesMotion = () => {
      const rect = writerNotesSection.getBoundingClientRect();
      const viewport = window.innerHeight || 1;
      const progress = Math.min(1, Math.max(0, (viewport - rect.top) / (viewport + rect.height)));
      const shift = Math.round((progress - 0.5) * 320);
      writerNotesSection.style.setProperty('--notes-scroll-shift', `${shift}px`);
      writerNotesSection.style.setProperty('--notes-scroll-shift-low', `${Math.round(shift * 0.72)}px`);
    };
    updateWriterNotesMotion();
    window.addEventListener('scroll', updateWriterNotesMotion, { passive: true });
    window.addEventListener('resize', updateWriterNotesMotion);
  }

  const mobileMenu = document.querySelector('.mobile-menu');
  const navLinks = document.querySelector('.nav-links');
  if (mobileMenu) {
    mobileMenu.addEventListener('click', () => {
      navLinks.classList.toggle('mobile-open');
    });
  }

  function animateValue(el, start, end, duration) {
    if (start === end) {
      el.textContent = end.toLocaleString();
      return;
    }
    const range = end - start;
    const startTime = performance.now();
    function step(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(start + range * eased).toLocaleString();
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function formatCompactNumber(value) {
    const num = Number(value) || 0;
    const abs = Math.abs(num);
    const units = [
      { value: 1_000_000_000, suffix: 'B' },
      { value: 1_000_000, suffix: 'M' },
      { value: 1_000, suffix: 'K' }
    ];
    const unit = units.find(item => abs >= item.value);
    if (!unit) return Math.round(num).toLocaleString();
    const scaled = num / unit.value;
    const rounded = scaled >= 100 ? Math.round(scaled).toString() : scaled.toFixed(scaled >= 10 ? 1 : 1).replace(/\.0$/, '');
    return `${rounded}${unit.suffix}`;
  }

  const fallbackStats = { totalWords: 146000, totalHours: 115, totalWriters: 524, totalDocuments: 628, activeNow: 0 };
  let currentStats = { ...fallbackStats };
  let statsVisible = false;

  function renderPublicStats(data) {
    data = { ...fallbackStats, ...data };
    const wordEl = document.getElementById('stat-words');
    const sessionEl = document.getElementById('stat-sessions');
    const writerEl = document.getElementById('stat-writers');
    const activeEl = document.getElementById('stat-active');
    const landingWriterEl = document.getElementById('landing-stat-writers');
    const landingWordEl = document.getElementById('landing-stat-words');
    const landingDocumentEl = document.getElementById('landing-stat-documents');

    if (landingWriterEl) landingWriterEl.textContent = formatCompactNumber(data.totalWriters);
    if (landingWordEl) landingWordEl.textContent = formatCompactNumber(data.totalWords);
    if (landingDocumentEl) landingDocumentEl.textContent = formatCompactNumber(data.totalDocuments);

    if (statsVisible) {
      if (wordEl) animateValue(wordEl, currentStats.totalWords, data.totalWords, 800);
      if (sessionEl) animateValue(sessionEl, currentStats.totalHours, data.totalHours, 800);
      if (writerEl) animateValue(writerEl, currentStats.totalWriters, data.totalWriters, 800);
      if (activeEl) animateValue(activeEl, currentStats.activeNow || 0, data.activeNow || 0, 800);
    } else {
      if (wordEl) wordEl.textContent = data.totalWords.toLocaleString();
      if (sessionEl) sessionEl.textContent = data.totalHours.toLocaleString();
      if (writerEl) writerEl.textContent = data.totalWriters.toLocaleString();
      if (activeEl) activeEl.textContent = (data.activeNow || 0).toLocaleString();
    }

    currentStats = data;
    if (data.totalWords > 0) drawGrowthChart(data.totalWords);
  }

  async function fetchStats() {
    try {
      const res = await fetch('/api/stats/public');
      if (!res.ok) {
        renderPublicStats(fallbackStats);
        return;
      }
      const data = { ...fallbackStats, ...(await res.json()) };
      renderPublicStats(data);
    } catch {
      renderPublicStats(fallbackStats);
    }
  }

  const statsBar = document.querySelector('.stats-bar');
  if (statsBar) {
    const statsObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !statsVisible) {
        statsVisible = true;
        fetchStats();
      }
    }, { threshold: 0.3 });
    statsObserver.observe(statsBar);
  }

  fetchStats();
  setInterval(fetchStats, 30000);

  // ── Releases Carousel ──
  const track = document.getElementById('releases-track');
  const cards = track ? Array.from(track.querySelectorAll('.release-card')) : [];
  const prevBtn = document.getElementById('rel-prev');
  const nextBtn = document.getElementById('rel-next');
  const dotsWrap = document.getElementById('releases-dots');
  const counterCurrent = document.getElementById('release-current');
  const counterTotal = document.getElementById('release-total');
  let activeIndex = 0;

  if (track && cards.length) {
    if (counterTotal) counterTotal.textContent = String(cards.length).padStart(2, '0');

    cards.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.className = 'releases-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', `Release ${i + 1}`);
      dot.addEventListener('click', () => goTo(i));
      dotsWrap.appendChild(dot);
    });

    function goTo(index) {
      if (index < 0 || index >= cards.length) return;
      activeIndex = index;

      // Use the viewport and card widths to calculate pixel offset
      const viewport = track.parentElement;
      const vpWidth = viewport.offsetWidth;
      const cardEl = cards[index];
      // Get the card's left offset relative to track start
      const cardLeft = cardEl.offsetLeft;
      const cardWidth = cardEl.offsetWidth;
      // Center the card in the viewport
      const offset = cardLeft - (vpWidth / 2) + (cardWidth / 2);
      track.style.transform = `translateX(-${Math.max(0, offset)}px)`;

      cards.forEach((c, i) => c.classList.toggle('active', i === index));
      dotsWrap.querySelectorAll('.releases-dot').forEach((d, i) => d.classList.toggle('active', i === index));
      if (counterCurrent) counterCurrent.textContent = String(index + 1).padStart(2, '0');
      prevBtn.disabled = index === 0;
      nextBtn.disabled = index === cards.length - 1;
    }

    prevBtn.addEventListener('click', () => goTo(activeIndex - 1));
    nextBtn.addEventListener('click', () => goTo(activeIndex + 1));

    // Touch/swipe
    let touchStartX = 0;
    let touchDelta = 0;
    const viewport = track.parentElement;
    viewport.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; touchDelta = 0; }, { passive: true });
    viewport.addEventListener('touchmove', (e) => { touchDelta = e.touches[0].clientX - touchStartX; }, { passive: true });
    viewport.addEventListener('touchend', () => {
      if (Math.abs(touchDelta) > 50) {
        if (touchDelta < 0) goTo(activeIndex + 1);
        else goTo(activeIndex - 1);
      }
      touchDelta = 0;
    });

    // Initialize after a frame so offsetLeft values are correct
    requestAnimationFrame(() => goTo(0));

    // Recalc on resize
    window.addEventListener('resize', () => goTo(activeIndex));
  }

  // ── Growth Chart (organic, fluctuating) ──
  let chartDrawn = false;
  let chartDrawnStyle = '';
  let lastGrowthTotal = 0;

  window.addEventListener('landing-style-change', () => {
    if (lastGrowthTotal > 0) drawGrowthChart(lastGrowthTotal);
  });

  function drawGrowthChart(totalWords) {
    const currentChartStyle = document.body.classList.contains('dream-landing')
      ? 'dream'
      : document.documentElement.classList.contains('sepia')
        ? 'sepia'
        : document.documentElement.classList.contains('light')
          ? 'light'
          : 'dark';

    if (chartDrawn && chartDrawnStyle === currentChartStyle) {
      const el = document.getElementById('growth-total');
      if (el) el.textContent = totalWords.toLocaleString();
      return;
    }
    chartDrawn = true;
    chartDrawnStyle = currentChartStyle;
    lastGrowthTotal = totalWords;

    const canvas = document.getElementById('growth-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const rect = canvas.parentElement.getBoundingClientRect();
    const w = rect.width - 56;
    const h = 220;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);

    // Generate daily data points (56 days) with realistic fluctuations
    const days = 56;
    const labels = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      labels.push(d);
    }

    // Seeded PRNG for consistent results
    function seededRandom(seed) {
      let s = seed;
      return function() {
        s = (s * 16807 + 0) % 2147483647;
        return (s - 1) / 2147483646;
      };
    }
    const rand = seededRandom(42);

    const dailyWords = [];
    for (let i = 0; i < days; i++) {
      const trendMultiplier = 0.3 + 0.7 * Math.pow(i / days, 1.2);
      const dayOfWeek = labels[i].getDay();
      const weekendFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.6 : 1.0;
      const dailyRand = rand();
      let dailyAmount;
      if (dailyRand < 0.08) {
        dailyAmount = 0;
      } else if (dailyRand > 0.92) {
        dailyAmount = (800 + rand() * 1200) * trendMultiplier;
      } else {
        dailyAmount = (100 + rand() * 500) * trendMultiplier * weekendFactor;
      }
      dailyWords.push(Math.round(dailyAmount));
    }

    const rawTotal = dailyWords.reduce((a, b) => a + b, 0);
    const scale = rawTotal > 0 ? totalWords / rawTotal : 1;
    const cumulative = [];
    let running = 0;
    for (let i = 0; i < days; i++) {
      running += dailyWords[i] * scale;
      cumulative.push(Math.round(running));
    }
    cumulative[cumulative.length - 1] = totalWords;

    const padLeft = 64;
    const padRight = 28;
    const padTop = 16;
    const padBottom = 44;
    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;
    const maxVal = totalWords * 1.12;

    function xPos(i) { return padLeft + (i / (days - 1)) * chartW; }
    function yPos(v) { return padTop + chartH - (v / maxVal) * chartH; }

    const isDreamLanding = document.body.classList.contains('dream-landing');
    const isSepia = document.documentElement.classList.contains('sepia');
    const isDark = !isDreamLanding && !document.documentElement.classList.contains('light') && !isSepia;
    const gridColor = isDreamLanding
      ? 'rgba(22, 99, 79, 0.12)'
      : isDark ? 'rgba(255,255,255,0.06)' : isSepia ? 'rgba(100,65,20,0.08)' : 'rgba(0,0,0,0.06)';
    const labelColor = isDreamLanding
      ? 'rgba(23, 60, 53, 0.62)'
      : isDark ? 'rgba(255,255,255,0.35)' : isSepia ? 'rgba(100,65,20,0.5)' : 'rgba(0,0,0,0.4)';
    const isLight = document.documentElement.classList.contains('light');
    const accentColor = isDreamLanding ? '#16634f' : isSepia ? '#C37E3F' : isLight ? '#22c55e' : '#4ade80';
    const areaColor = isDreamLanding
      ? ['rgba(22, 99, 79, 0.24)', 'rgba(120, 215, 200, 0.12)', 'rgba(120, 215, 200, 0.01)']
      : ['rgba(74, 222, 128, 0.22)', 'rgba(74, 222, 128, 0.06)', 'rgba(74, 222, 128, 0.01)'];

    const gridLines = 4;

    // Helper: build the curve path (reused everywhere)
    function buildCurvePath(count) {
      ctx.moveTo(xPos(0), yPos(cumulative[0]));
      for (let i = 1; i < count; i++) {
        const prevX = xPos(i - 1);
        const prevY = yPos(cumulative[i - 1]);
        const currX = xPos(i);
        const currY = yPos(cumulative[i]);
        const cpx = (prevX + currX) / 2;
        ctx.bezierCurveTo(cpx, prevY, cpx, currY, currX, currY);
      }
    }

    function drawFullFrame(drawCount, showDot, timestamp) {
      // Clear entire canvas
      ctx.clearRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      for (let i = 0; i <= gridLines; i++) {
        const y = padTop + (chartH / gridLines) * i;
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(w - padRight, y);
        ctx.stroke();

        const val = Math.round(maxVal - (maxVal / gridLines) * i);
        ctx.fillStyle = labelColor;
        ctx.font = '11px "Instrument Sans", system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(val >= 1000 ? (val / 1000).toFixed(1) + 'k' : val.toString(), padLeft - 8, y + 4);
      }

      // X-axis labels
      ctx.fillStyle = labelColor;
      ctx.font = '10px "Instrument Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      const step = Math.floor(days / 7);
      for (let i = 0; i < days; i += step) {
        ctx.fillText(labels[i].toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), xPos(i), h - 8);
      }
      ctx.fillText(labels[days - 1].toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), xPos(days - 1), h - 8);

      ctx.save();
      ctx.fillStyle = labelColor;
      ctx.font = '700 11px "Instrument Sans", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Words', padLeft, 11);
      ctx.textAlign = 'right';
      ctx.fillText('Last 8 weeks', w - padRight, h - 24);
      ctx.restore();

      // Filled area
      ctx.beginPath();
      ctx.moveTo(xPos(0), yPos(0));
      ctx.lineTo(xPos(0), yPos(cumulative[0]));
      for (let i = 1; i < drawCount; i++) {
        const prevX = xPos(i - 1);
        const prevY = yPos(cumulative[i - 1]);
        const currX = xPos(i);
        const currY = yPos(cumulative[i]);
        const cpx = (prevX + currX) / 2;
        ctx.bezierCurveTo(cpx, prevY, cpx, currY, currX, currY);
      }
      ctx.lineTo(xPos(drawCount - 1), yPos(0));
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
      grad.addColorStop(0, areaColor[0]);
      grad.addColorStop(0.6, areaColor[1]);
      grad.addColorStop(1, areaColor[2]);
      ctx.fillStyle = grad;
      ctx.fill();

      // Line
      ctx.beginPath();
      buildCurvePath(drawCount);
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Glow
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.filter = 'blur(6px)';
      ctx.beginPath();
      buildCurvePath(drawCount);
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();

      // Dot
      if (showDot) {
        const lastI = drawCount - 1;
        const pulseSize = timestamp ? 4 + Math.sin(timestamp / 400) * 1.5 : 4;
        ctx.beginPath();
        ctx.arc(xPos(lastI), yPos(cumulative[lastI]), pulseSize, 0, Math.PI * 2);
        ctx.fillStyle = accentColor;
        ctx.fill();
        ctx.strokeStyle = isDark ? '#111111' : '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Animate
    const animDuration = 1800;
    const animStart = performance.now();

    function animate(timestamp) {
      const progress = Math.min((timestamp - animStart) / animDuration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const drawCount = Math.max(2, Math.ceil(days * eased));

      drawFullFrame(drawCount, true, timestamp);

      // Counter
      const el = document.getElementById('growth-total');
      if (el) el.textContent = Math.floor(totalWords * eased).toLocaleString();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Pulse loop — full redraw each frame to avoid artifacts
        function pulse(ts) {
          drawFullFrame(days, true, ts);
          requestAnimationFrame(pulse);
        }
        requestAnimationFrame(pulse);
      }
    }

    const chartObserver = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        chartObserver.disconnect();
        requestAnimationFrame(animate);
      }
    }, { threshold: 0.3 });
    chartObserver.observe(canvas);
  }
});
