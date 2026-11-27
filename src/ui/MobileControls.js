/**
 * Top-Tier Action Mobile Controls (《影之刃：断魂局》顶尖手游触控系统)
 * - Floating dynamic left virtual joystick with 360° analog walk/sprint & thumb-follow
 * - Independent multi-touch right-side smooth camera orbit with anti-nausea velocity cap
 * - Ergonomic golden-arc combat button wheel (Attack + Hold-Combo, Parry/Guard, Dash, Dual Skill Chains, Gourd, Execution)
 * - Tactile haptic feedback + 1-tap Camera Recenter + Fullscreen toggle + non-blocking portrait hint
 */

const UPPER_NAMES = ['踏影', '旋风', '千裂'];
const LOWER_NAMES = ['裂地', '飞燕', '坠天'];

export class MobileControls {
  constructor({ game }) {
    this.game = game;
    this.enabled = false;
    this.root = document.getElementById('mobile-controls');
    this.joystickZone = document.getElementById('mobile-joystick-zone');
    this.joystickBase = document.getElementById('joystick-base');
    this.joystickKnob = document.getElementById('joystick-knob');
    this.joystickArc = document.getElementById('joystick-arc');
    this.cameraZone = document.getElementById('mobile-camera-zone');
    this.portraitHint = document.getElementById('portrait-hint');

    this.btnAttack = document.getElementById('mbtn-attack');
    this.btnParry = document.getElementById('mbtn-parry');
    this.btnDash = document.getElementById('mbtn-dash');
    this.btnUpper = document.getElementById('mbtn-upper');
    this.btnLower = document.getElementById('mbtn-lower');
    this.btnGourd = document.getElementById('mbtn-gourd');
    this.btnExec = document.getElementById('mbtn-exec');
    this.btnRecenter = document.getElementById('mbtn-recenter');
    this.btnFullscreen = document.getElementById('mbtn-fullscreen');

    this.joyTouchId = null;
    this.joyCenter = { x: 0, y: 0 };
    this.joyMaxRadius = 54;

    this.camTouchId = null;
    this.camLastPos = { x: 0, y: 0 };
    this.lastCamTapTime = 0;

    this.portraitDismissed = false;

    const params = new URLSearchParams(window.location.search);
    const forcedMobile = params.get('mobile') === '1';
    const isCoarse = window.matchMedia?.('(pointer: coarse)').matches;
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (forcedMobile || isCoarse || (hasTouch && window.innerWidth <= 1100)) {
      this.activate();
    } else if (hasTouch) {
      // Hybrid tablet/laptop: seamlessly activate on first touch
      window.addEventListener('touchstart', () => this.activate(), { once: true, passive: true });
    }

    this._bindEvents();
  }

  static isLikelyMobile() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mobile') === '1') return true;
    const isCoarse = window.matchMedia?.('(pointer: coarse)').matches;
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    return Boolean(isCoarse || (hasTouch && window.innerWidth <= 1100));
  }

  activate() {
    if (this.enabled) return;
    this.enabled = true;
    document.body.classList.add('is-mobile');
    this._updatePortraitHint();
  }

  vibrate(ms = 10) {
    try {
      const canVibrate = !navigator.userActivation || navigator.userActivation.hasBeenActive;
      if (this.enabled && canVibrate && navigator.vibrate) navigator.vibrate(ms);
    } catch (_) {}
  }

  _updatePortraitHint() {
    if (!this.portraitHint) return;
    const isPortrait = window.innerHeight > window.innerWidth * 1.08;
    const show = this.enabled && isPortrait && !this.portraitDismissed && this.game.gameStarted;
    this.portraitHint.classList.toggle('hidden', !show);
  }

  _bindEvents() {
    window.addEventListener('resize', () => this._updatePortraitHint());
    window.addEventListener('orientationchange', () => setTimeout(() => this._updatePortraitHint(), 150));

    if (this.portraitHint) {
      this.portraitHint.addEventListener('click', () => {
        this.portraitDismissed = true;
        this.portraitHint.classList.add('hidden');
      });
    }

    // Make center execution prompt also tappable directly
    const execPrompt = document.getElementById('execution-prompt');
    if (execPrompt) {
      const triggerExec = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.game.player?.queueAttack('execute');
        this.vibrate(28);
      };
      execPrompt.addEventListener('touchstart', triggerExec, { passive: false });
      execPrompt.addEventListener('mousedown', triggerExec);
    }

    this._bindJoystick();
    this._bindCameraDrag();
    this._bindActionButtons();
  }

  _bindJoystick() {
    if (!this.joystickZone || !this.joystickBase || !this.joystickKnob) return;

    const resetJoystick = () => {
      this.joyTouchId = null;
      this.joystickBase.classList.remove('active');
      this.joystickBase.style.left = '';
      this.joystickBase.style.top = '';
      this.joystickKnob.style.transform = 'translate(-50%, -50%)';
      if (this.joystickArc) this.joystickArc.style.opacity = '0';
      this.game.player?.setVirtualMove(0, 0);
    };

    const updateFromPoint = (clientX, clientY) => {
      let dx = clientX - this.joyCenter.x;
      let dy = clientY - this.joyCenter.y;
      let dist = Math.hypot(dx, dy);

      // Dynamic thumb-follow: gently pull base if thumb drags far past outer ring
      if (dist > this.joyMaxRadius * 1.18) {
        const pull = dist - this.joyMaxRadius * 1.18;
        const nx = dx / dist;
        const ny = dy / dist;
        const zoneRect = this.joystickZone.getBoundingClientRect();
        this.joyCenter.x = Math.max(zoneRect.left + 48, Math.min(zoneRect.right - 48, this.joyCenter.x + nx * pull));
        this.joyCenter.y = Math.max(zoneRect.top + 48, Math.min(zoneRect.bottom - 48, this.joyCenter.y + ny * pull));
        this.joystickBase.style.left = `${this.joyCenter.x - zoneRect.left}px`;
        this.joystickBase.style.top = `${this.joyCenter.y - zoneRect.top}px`;
        dx = clientX - this.joyCenter.x;
        dy = clientY - this.joyCenter.y;
        dist = Math.hypot(dx, dy);
      }

      const clamped = Math.min(dist, this.joyMaxRadius);
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * clamped;
      const ky = Math.sin(angle) * clamped;

      this.joystickKnob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;

      const norm = clamped / this.joyMaxRadius;
      if (norm < 0.1) {
        this.game.player?.setVirtualMove(0, 0);
        if (this.joystickArc) this.joystickArc.style.opacity = '0';
      } else {
        const adj = (norm - 0.1) / 0.9;
        const mx = Math.cos(angle) * adj;
        const mz = Math.sin(angle) * adj;
        this.game.player?.setVirtualMove(mx, mz);
        if (this.joystickArc) {
          this.joystickArc.style.opacity = String(Math.min(1, adj * 1.15));
          this.joystickArc.style.transform = `translate(-50%, -50%) rotate(${angle + Math.PI / 2}rad)`;
        }
      }
    };

    this.joystickZone.addEventListener('touchstart', (e) => {
      if (!this.game.gameStarted || this.game.story.inCutscene || this.game.gameEnded) return;
      if (this.joyTouchId !== null) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      e.preventDefault();
      this.joyTouchId = touch.identifier;

      const zoneRect = this.joystickZone.getBoundingClientRect();
      this.joyCenter.x = Math.max(zoneRect.left + 52, Math.min(zoneRect.right - 52, touch.clientX));
      this.joyCenter.y = Math.max(zoneRect.top + 52, Math.min(zoneRect.bottom - 52, touch.clientY));
      this.joystickBase.style.left = `${this.joyCenter.x - zoneRect.left}px`;
      this.joystickBase.style.top = `${this.joyCenter.y - zoneRect.top}px`;
      this.joystickBase.classList.add('active');
      updateFromPoint(touch.clientX, touch.clientY);
    }, { passive: false });

    this.joystickZone.addEventListener('touchmove', (e) => {
      if (this.joyTouchId === null) return;
      for (const touch of e.changedTouches) {
        if (touch.identifier === this.joyTouchId) {
          e.preventDefault();
          updateFromPoint(touch.clientX, touch.clientY);
          break;
        }
      }
    }, { passive: false });

    const onEnd = (e) => {
      if (this.joyTouchId === null) return;
      for (const touch of e.changedTouches) {
        if (touch.identifier === this.joyTouchId) {
          resetJoystick();
          break;
        }
      }
    };
    this.joystickZone.addEventListener('touchend', onEnd, { passive: true });
    this.joystickZone.addEventListener('touchcancel', onEnd, { passive: true });
  }

  _bindCameraDrag() {
    if (!this.cameraZone) return;

    this.cameraZone.addEventListener('touchstart', (e) => {
      if (!this.game.gameStarted || this.game.story.inCutscene || this.game.gameEnded) return;
      if (this.camTouchId !== null) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      e.preventDefault();

      const now = performance.now();
      if (now - this.lastCamTapTime < 280) {
        this.game.recenterCamera?.();
        this.vibrate(10);
        this.lastCamTapTime = 0;
      } else {
        this.lastCamTapTime = now;
      }

      this.camTouchId = touch.identifier;
      this.camLastPos.x = touch.clientX;
      this.camLastPos.y = touch.clientY;
    }, { passive: false });

    this.cameraZone.addEventListener('touchmove', (e) => {
      if (this.camTouchId === null) return;
      for (const touch of e.changedTouches) {
        if (touch.identifier === this.camTouchId) {
          e.preventDefault();
          const rawDx = touch.clientX - this.camLastPos.x;
          const rawDy = touch.clientY - this.camLastPos.y;
          this.camLastPos.x = touch.clientX;
          this.camLastPos.y = touch.clientY;

          // Clamp extreme swipe spikes to keep camera silky & anti-nausea
          const dx = Math.max(-42, Math.min(42, rawDx));
          const dy = Math.max(-28, Math.min(28, rawDy));
          this.game.orbitCameraBy?.(dx * 0.0042, dy * 0.0026);
          break;
        }
      }
    }, { passive: false });

    const onEnd = (e) => {
      if (this.camTouchId === null) return;
      for (const touch of e.changedTouches) {
        if (touch.identifier === this.camTouchId) {
          this.camTouchId = null;
          break;
        }
      }
    };
    this.cameraZone.addEventListener('touchend', onEnd, { passive: true });
    this.cameraZone.addEventListener('touchcancel', onEnd, { passive: true });
  }

  _bindActionButtons() {
    const bindTouchBtn = (el, { onDown, onUp, haptic = 10 }) => {
      if (!el) return;
      let activeTouchId = null;

      const handleDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('pressed');
        this.vibrate(haptic);
        onDown?.();
      };

      const handleUp = (e) => {
        if (e) e.stopPropagation();
        el.classList.remove('pressed');
        onUp?.();
      };

      el.addEventListener('touchstart', (e) => {
        if (activeTouchId !== null) return;
        const t = e.changedTouches[0];
        activeTouchId = t ? t.identifier : 0;
        handleDown(e);
      }, { passive: false });

      const endTouch = (e) => {
        if (activeTouchId === null) return;
        for (const t of e.changedTouches) {
          if (t.identifier === activeTouchId) {
            activeTouchId = null;
            handleUp(e);
            break;
          }
        }
      };
      el.addEventListener('touchend', endTouch, { passive: true });
      el.addEventListener('touchcancel', endTouch, { passive: true });

      // Also support mouse click when testing with ?mobile=1 on desktop
      el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        handleDown(e);
      });
      el.addEventListener('mouseup', handleUp);
      el.addEventListener('mouseleave', () => {
        if (el.classList.contains('pressed')) handleUp();
      });
    };

    bindTouchBtn(this.btnAttack, {
      haptic: 8,
      onDown: () => {
        if (!this.game.player) return;
        this.game.player.attackHolding = true;
        this.game.player.queueAttack('basic');
      },
      onUp: () => {
        if (this.game.player) this.game.player.attackHolding = false;
      },
    });

    bindTouchBtn(this.btnParry, {
      haptic: 12,
      onDown: () => this.game.player?.startParry(),
      onUp: () => this.game.player?.stopGuard(),
    });

    bindTouchBtn(this.btnDash, {
      haptic: 10,
      onDown: () => this.game.player?.triggerDash(),
    });

    bindTouchBtn(this.btnUpper, {
      haptic: 12,
      onDown: () => this.game.player?.queueAttack('upper'),
    });

    bindTouchBtn(this.btnLower, {
      haptic: 12,
      onDown: () => this.game.player?.queueAttack('lower'),
    });

    bindTouchBtn(this.btnGourd, {
      haptic: 10,
      onDown: () => this.game.player?.useGourd(),
    });

    bindTouchBtn(this.btnExec, {
      haptic: 28,
      onDown: () => this.game.player?.queueAttack('execute'),
    });

    bindTouchBtn(this.btnRecenter, {
      haptic: 8,
      onDown: () => this.game.recenterCamera?.(),
    });

    bindTouchBtn(this.btnFullscreen, {
      haptic: 8,
      onDown: async () => {
        try {
          if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen?.();
            await screen.orientation?.lock?.('landscape').catch(() => {});
          } else {
            await document.exitFullscreen?.();
          }
        } catch (_) {}
      },
    });
  }

  syncState(player, { canExec = false, controlsOn = false } = {}) {
    if (!this.enabled || !this.root) return;
    this.root.classList.toggle('hidden', !controlsOn);
    this._updatePortraitHint();
    if (!player) return;

    // Attack button riposte glow
    if (this.btnAttack) {
      const isRiposte = player.riposteTimer > 0;
      this.btnAttack.classList.toggle('riposte-ready', isRiposte);
      const lbl = this.btnAttack.querySelector('.mbtn-label');
      if (lbl) lbl.textContent = isRiposte ? '追魂' : '斩';
    }

    // Parry active state
    if (this.btnParry) {
      this.btnParry.classList.toggle('guard-active', player.parryTimer > 0 || player.guardHolding);
    }

    // Dash stamina availability
    if (this.btnDash) {
      this.btnDash.classList.toggle('on-cooldown', player.stamina < 18);
    }

    // Upper Skill Chain button live step & cooldown
    if (this.btnUpper) {
      const cd = player.upperCooldown;
      this.btnUpper.classList.toggle('on-cooldown', cd > 0);
      const lbl = this.btnUpper.querySelector('.mbtn-label');
      const sub = this.btnUpper.querySelector('.mbtn-sub');
      if (lbl) lbl.textContent = UPPER_NAMES[player.upperStep] || '影杀';
      if (sub) sub.textContent = cd > 0 ? `${cd.toFixed(1)}s` : `${player.upperStep + 1}/3`;
    }

    // Lower Skill Chain button live step & cooldown
    if (this.btnLower) {
      const cd = player.lowerCooldown;
      this.btnLower.classList.toggle('on-cooldown', cd > 0);
      const lbl = this.btnLower.querySelector('.mbtn-label');
      const sub = this.btnLower.querySelector('.mbtn-sub');
      if (lbl) lbl.textContent = LOWER_NAMES[player.lowerStep] || '赤霄';
      if (sub) sub.textContent = cd > 0 ? `${cd.toFixed(1)}s` : `${player.lowerStep + 1}/3`;
    }

    // Gourd count & low-HP pulse
    if (this.btnGourd) {
      const sub = this.btnGourd.querySelector('.mbtn-sub');
      if (sub) sub.textContent = `×${player.gourds}`;
      this.btnGourd.classList.toggle('on-cooldown', player.gourds <= 0 || player.hp >= player.maxHp);
      this.btnGourd.classList.toggle('low-hp-pulse', player.gourds > 0 && player.hp < player.maxHp * 0.45);
    }

    // Execution button visibility
    if (this.btnExec) {
      this.btnExec.classList.toggle('hidden', !canExec);
    }
  }
}
