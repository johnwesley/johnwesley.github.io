/*
 * Security vs. usability: two linked sliders and a "Good engineering" switch.
 *
 * The stops come from the JSON block the page renders from
 * _data/security_vs_usability.yml (least secure first). Nothing here assumes
 * how many stops there are. All visible copy is in the page, not here.
 *
 * State is two things: the current stop and whether the switch is on.
 * The usability slider moves only when the words change.
 *
 * Usability positions run from 0 (least usable) to N-1. With the switch off,
 * stop i sits at N-1-i; with it on, a stop with a better version sits at its
 * better_at, which need not be a whole number (8.5 sits between two ticks).
 */
(function () {
    'use strict';

    // Positions closer than this are the same position (guards against
    // floating-point noise, e.g. 0.1 + 0.2). Only for positions: whether the
    // slider moved is an exact comparison, because the finest step is EPS.
    var EPS = 1e-6;

    var app = document.getElementById('svu-app');
    var fallback = document.getElementById('svu-table');
    var dataEl = document.getElementById('stops-data');
    var secSlider = document.getElementById('svu-security');
    var useSlider = document.getElementById('svu-usability');
    var secPhrase = document.getElementById('svu-security-phrase');
    var usePhrase = document.getElementById('svu-usability-phrase');
    var caption = document.getElementById('svu-caption');
    var toggle = document.getElementById('svu-better');
    var note = document.getElementById('svu-note');
    if (!app || !dataEl || !secSlider || !useSlider || !secPhrase || !usePhrase ||
        !caption || !toggle || !note) {
        return;
    }

    function warn(message) {
        if (window.console && console.warn) console.warn('security-vs-usability: ' + message);
    }

    // On any problem with the data, leave the no-JavaScript table in place.
    var raw;
    try {
        raw = JSON.parse(dataEl.textContent);
    } catch (e) {
        warn('could not read the stops data; showing the table instead.');
        return;
    }
    if (!Array.isArray(raw) || raw.length === 0) {
        warn('no stops; showing the table instead.');
        return;
    }

    var N = raw.length;
    var stops = raw.map(function (s, i) {
        s = s || {};
        // The page decides which `better` phrases are usable and passes only
        // those, so the table and this view always agree. It flags the ones it
        // dropped so they show up here.
        var better = null;
        var betterAt = null;
        if (s.better_ignored) {
            warn('stop ' + i + ': better needs text and better_at needs a number from 0 to ' +
                (N - 1) + '; ignoring them.');
        }
        if (typeof s.better === 'string' && s.better !== '' && typeof s.better_at === 'number' &&
            isFinite(s.better_at) && s.better_at >= 0 && s.better_at <= N - 1) {
            better = s.better;
            betterAt = s.better_at;
        }
        return {
            security: String(s.security == null ? '' : s.security),
            usability: String(s.usability == null ? '' : s.usability),
            better: better,
            betterAt: betterAt
        };
    });

    var copy = {
        captionFirst: app.getAttribute('data-caption-first') || '',
        captionLast: app.getAttribute('data-caption-last') || '',
        noteOff: app.getAttribute('data-note-off') || '',
        noteBetter: app.getAttribute('data-note-better') || '',
        noteSame: app.getAttribute('data-note-same') || ''
    };

    // Start in the middle (rounding down: stop 4 of 0..9), switch off.
    var state = { stop: Math.floor((N - 1) / 2), better: false };

    // The stop and usability position the usability slider last settled on,
    // and the value the slider really holds there (a position with more than
    // six decimals is rounded to the slider's step).
    var settledStop = -1;
    var settledPos = -1;
    var settledValue = -1;

    function improved(i) {
        return state.better && stops[i].better !== null;
    }

    function usabilityPos(i) {
        return improved(i) ? stops[i].betterAt : N - 1 - i;
    }

    function usabilityPhrase(i) {
        return improved(i) ? stops[i].better : stops[i].usability;
    }

    function near(a, b) {
        return Math.abs(a - b) <= EPS;
    }

    // The stop with the smallest distance(i), skipping stops where it returns
    // null; on a tie, the more secure (higher-numbered) stop. -1 if none.
    function closest(distance) {
        var best = -1;
        var bestDist = Infinity;
        for (var i = 0; i < N; i++) {
            var d = distance(i);
            if (d === null) continue;
            if (d < bestDist - EPS || near(d, bestDist)) {
                best = i;
                bestDist = Math.min(bestDist, d);
            }
        }
        return best;
    }

    // The stop whose usability position is nearest to u.
    function stopForUsability(u) {
        return closest(function (i) {
            return Math.abs(usabilityPos(i) - u);
        });
    }

    // A move that is not a pointer drag (arrow keys, Home/End, screen-reader
    // swipes) goes to the stop nearest the new position, but always at least
    // one stop further the way it moved: if that would leave the handle where
    // it was, it carries on to the next position that way. So one arrow press
    // or swipe moves exactly one stop and never gets stuck; at either end
    // there is nothing further, and nothing moves.
    function stepToward(u) {
        if (u === settledValue) return settledStop;
        var dir = u > settledValue ? 1 : -1;
        var target = stopForUsability(u);
        if ((usabilityPos(target) - settledPos) * dir > EPS) return target;
        var next = closest(function (i) {
            var d = (usabilityPos(i) - settledPos) * dir;
            return d > EPS ? d : null;
        });
        return next === -1 ? settledStop : next;
    }

    function clamp(v) {
        if (!(v >= 0)) return 0;  // also NaN
        return v > N - 1 ? N - 1 : v;
    }

    // The security slider moves in whole stops.
    function toStop(value) {
        return clamp(Math.round(Number(value)));
    }

    // The usability slider's value as a position; not rounded, so a value
    // between two ticks stays where it is.
    function toUsability(value) {
        return clamp(Number(value));
    }

    // The usability slider's step: one decimal place finer than the most
    // precise position (0.1 for whole numbers, 0.01 for half steps such as
    // 8.5, 0.001 for 8.25), and never finer than 0.000001. A decimal step
    // divides every whole number, so both ends and every position sit on the
    // slider's grid (within EPS); one native step (an arrow key, a
    // screen-reader swipe) is smaller than any gap between two positions; and
    // a click lands within half a step of where it was made. Never "any":
    // with it, Firefox moves a whole unit per arrow press, and stepUp() throws.
    function usabilityStep() {
        for (var d = 0; d < 5; d++) {
            var scale = Math.pow(10, d);
            var fits = true;
            for (var i = 0; i < N && fits; i++) {
                if (stops[i].betterAt !== null) {
                    var x = stops[i].betterAt * scale;
                    fits = Math.abs(x - Math.round(x)) <= EPS;
                }
            }
            if (fits) return Math.pow(10, -(d + 1)).toFixed(d + 1);
        }
        return '0.000001';
    }

    // Only touch the DOM when something changed, so the live regions do not
    // repeat themselves.
    function setText(el, text) {
        if (el.textContent !== text) el.textContent = text;
    }

    function setAttr(el, name, value) {
        if (el.getAttribute(name) !== value) el.setAttribute(name, value);
    }

    // keepUsabilityThumb: leave the usability thumb under the pointer while it
    // is being dragged; it settles on release.
    function render(keepUsabilityThumb) {
        var i = state.stop;
        var secText = stops[i].security;
        var useText = usabilityPhrase(i);

        secSlider.value = String(i);
        if (!keepUsabilityThumb) {
            useSlider.value = String(usabilityPos(i));
            settledStop = i;
            settledPos = usabilityPos(i);
            settledValue = toUsability(useSlider.value);
        }
        setAttr(secSlider, 'aria-valuetext', secText);
        setAttr(useSlider, 'aria-valuetext', useText);
        setText(secPhrase, secText);
        setText(usePhrase, useText);
        setText(caption, i === 0 ? copy.captionFirst : (i === N - 1 ? copy.captionLast : ''));
        setText(note, !state.better ? copy.noteOff :
            (stops[i].better !== null ? copy.noteBetter : copy.noteSame));
        toggle.checked = state.better;
    }

    // Security slider: the current stop is its value.
    function onSecurity() {
        state.stop = toStop(secSlider.value);
        dragMoved = false;  // a held usability drag must not undo this on release
        notePressInput(secSlider);
        render(false);
    }
    secSlider.addEventListener('input', onSecurity);
    secSlider.addEventListener('change', onSecurity);

    // Usability slider. While a pointer (mouse, pen or finger) drags it, show
    // the nearest stop live and settle on the nearest stop on release. A drag
    // that fires no input settles nothing; a mouse or pen click on a handle
    // is handled separately below (see clickAt). Any other change
    // (keys, screen readers) is a step.
    var dragging = false;
    var dragMoved = false;
    var dragPointer = null;  // pointerId that started the drag
    var dragPointerType = '';
    var dragTouch = null;    // Touch.identifier of the finger that started it

    function settleUsability() {
        state.stop = stopForUsability(toUsability(useSlider.value));
        render(false);
    }

    function startDrag(pointerId, pointerType, touchId) {
        dragging = true;
        dragMoved = false;
        dragPointer = pointerId;
        dragPointerType = pointerType;
        dragTouch = touchId;
    }

    function finishDrag() {
        if (!dragging) return;
        dragging = false;
        dragPointer = null;
        dragPointerType = '';
        dragTouch = null;
        if (dragMoved) settleUsability();
    }

    // Finish just after the release event: some browsers (Firefox) write the
    // drop position to the slider after it, and that is still part of the drag.
    function finishSoon() {
        window.setTimeout(finishDrag, 0);
    }

    function includesTouch(list, id) {
        for (var k = 0; list && k < list.length; k++) {
            if (list[k].identifier === id) return true;
        }
        return false;
    }

    useSlider.addEventListener('pointerdown', function (e) {
        if (dragging || e.button !== 0) return;
        startDrag(e.pointerId, e.pointerType, null);
    });
    // A context menu (Control-click on a Mac) can swallow the mouse release.
    useSlider.addEventListener('contextmenu', function () {
        if (dragging && dragPointerType === 'mouse') finishSoon();
    });
    // Leaving the page mid-drag: it may come back from the back/forward cache.
    window.addEventListener('pagehide', finishDrag);
    useSlider.addEventListener('touchstart', function (e) {
        var t = e.changedTouches && e.changedTouches[0];
        if (!t) return;
        // Pointer events come first; adopt the finger of a touch pointer drag.
        if (!dragging) startDrag(null, '', t.identifier);
        else if (dragTouch === null && dragPointerType === 'touch') dragTouch = t.identifier;
    }, { passive: true });

    // Only the pointer or finger that started the drag can end it.
    window.addEventListener('pointerup', function (e) {
        if (dragging && e.pointerId === dragPointer) finishSoon();
    });
    // A touch's pointer events can be cancelled once the native slider takes
    // over the gesture; that drag ends at touchend instead.
    window.addEventListener('pointercancel', function (e) {
        if (dragging && e.pointerId === dragPointer && e.pointerType !== 'touch') finishSoon();
    });
    function onTouchEnd(e) {
        if (dragging && dragTouch !== null && includesTouch(e.changedTouches, dragTouch)) finishSoon();
    }
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    // A lost release (the button came up where the page could not see it, e.g.
    // after switching tab or app mid-drag): the drag's mouse or pen then moves
    // with no buttons. That proves the button is up, so ending the drag here
    // cannot fight a native drag the way clearing it on keydown or blur did.
    // At once, not after a timer: Chrome can deliver this move and the next
    // press together, and that press must find the old drag already ended.
    window.addEventListener('pointermove', function (e) {
        if (dragging && e.pointerId === dragPointer && e.pointerType !== 'touch' && e.buttons === 0) {
            finishDrag();
        }
    });

    useSlider.addEventListener('input', function () {
        var u = toUsability(useSlider.value);
        notePressInput(useSlider);
        if (dragging) {
            dragMoved = true;
            state.stop = stopForUsability(u);
            render(true);
        } else {
            state.stop = stepToward(u);
            render(false);
        }
    });
    // A change to the position it already shows is not a move (Chrome sends
    // one after a cancelled touch drag even when the next tap moves nothing).
    // Exact: both sides come from the slider's own value string.
    useSlider.addEventListener('change', function () {
        var u = toUsability(useSlider.value);
        if (dragging || u === settledValue) return;
        state.stop = stepToward(u);
        render(false);
    });

    // A mouse or pen press on a handle grabs it without moving it, so a click
    // on a handle (its 44px circle; the box's corners act as track) fires no
    // input, even when it is nearer another stop (neighbouring stops can be
    // closer than that: 16px apart at 360px wide with half steps). Such a click counts as a click at that point: it
    // goes to the nearest stop, unless that stop sits where the handle already
    // is (pressing a handle in place changes nothing). Only a press on the
    // slider itself that fired no input and moved at most CLICK_SLOP px
    // sideways counts. Touch is left to the browser.
    var CLICK_SLOP = 4;  // px a click may travel
    var press = null;    // { slider, pointerId, x, moved }

    // The slider value under clientX: the handle's centre travels from half a
    // handle in from the left end to half a handle in from the right end.
    function valueAt(slider, clientX) {
        var hit = parseFloat(window.getComputedStyle(slider).getPropertyValue('--svu-hit'));
        var inset = hit > 0 ? hit / 2 : 22;
        var rect = slider.getBoundingClientRect();
        var span = rect.width - 2 * inset;
        if (!(span > 0)) return null;
        return clamp((clientX - rect.left - inset) / span * (N - 1));
    }

    function clickAt(p) {
        var v = valueAt(p.slider, p.x);
        if (v === null) return;
        var target;
        if (p.slider === secSlider) {
            target = clamp(Math.floor(v + 0.5 + EPS));  // a tie goes up, to the more secure stop
            if (target === state.stop) return;
        } else {
            target = stopForUsability(v);
            if (near(usabilityPos(target), settledPos)) return;
        }
        state.stop = target;
        dragMoved = false;
        render(false);
    }

    // An input on the pressed slider means the browser moved it itself; a
    // change from anywhere else (the other slider, the switch) cancels the
    // press, so its release cannot undo that change.
    function notePressInput(slider) {
        if (press && press.slider === slider) press.moved = true;
        else press = null;
    }

    function forgetPress() {
        press = null;
    }

    function onPress(e) {
        press = null;
        if (e.button !== 0 || e.pointerType === 'touch') return;
        // After a lost release, Chrome can send the next press to the slider
        // although it landed elsewhere on the page; only a press inside the
        // slider's own box counts.
        var r = e.currentTarget.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
        press = { slider: e.currentTarget, pointerId: e.pointerId, x: e.clientX, moved: false };
    }
    // Any press anywhere first forgets an old one whose release was lost
    // (capture phase, so it runs before onPress).
    window.addEventListener('pointerdown', forgetPress, true);
    secSlider.addEventListener('pointerdown', onPress);
    useSlider.addEventListener('pointerdown', onPress);
    // A context menu (Control-click on a Mac) is not a click.
    secSlider.addEventListener('contextmenu', forgetPress);
    useSlider.addEventListener('contextmenu', forgetPress);
    window.addEventListener('pagehide', forgetPress);
    window.addEventListener('pointercancel', function (e) {
        if (press && e.pointerId === press.pointerId) press = null;
    });
    window.addEventListener('pointerup', function (e) {
        var p = press;
        if (!p || e.pointerId !== p.pointerId) return;
        if (Math.abs(e.clientX - p.x) > CLICK_SLOP) {
            press = null;
            return;
        }
        // Just after the release, like finishSoon: Firefox writes the drop
        // position after pointerup, and that input still counts.
        window.setTimeout(function () {
            if (press !== p) return;
            press = null;
            if (!p.moved) clickAt(p);
        }, 0);
    });

    // Switch: the stop stays; the usability slider and phrase change only if
    // the stop has a better version.
    toggle.addEventListener('change', function () {
        state.better = toggle.checked;
        dragMoved = false;  // a held usability drag must not undo this on release
        forgetPress();
        render(false);
    });

    secSlider.max = String(N - 1);
    useSlider.max = String(N - 1);
    useSlider.step = usabilityStep();
    render(false);
    app.hidden = false;
    if (fallback) fallback.hidden = true;

    // On Back/Forward without the back/forward cache, the browser restores the
    // checkbox after this script has run; put it back in step with the state.
    window.addEventListener('pageshow', function () {
        if (!dragging) render(false);
    });
})();
