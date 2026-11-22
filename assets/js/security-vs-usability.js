/*
 * Security vs. usability: two linked sliders and a "Good engineering" switch.
 *
 * The stops come from the JSON block the page renders from
 * _data/security_vs_usability.yml (least secure first). Nothing here assumes
 * how many stops there are. All visible copy is in the page, not here.
 *
 * State is two things: the current stop and whether the switch is on.
 * The usability slider moves only when the words change.
 */
(function () {
    'use strict';

    var START_STOP = 3;

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
            warn('stop ' + i + ': better needs text and better_at needs a whole number from 0 to ' +
                (N - 1) + '; ignoring them.');
        }
        if (typeof s.better === 'string' && s.better !== '' && typeof s.better_at === 'number' &&
            s.better_at === Math.floor(s.better_at) && s.better_at >= 0 && s.better_at <= N - 1) {
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

    var state = { stop: Math.min(START_STOP, N - 1), better: false };

    // The stop and usability position the usability slider last settled on.
    var settledStop = -1;
    var settledPos = -1;

    function improved(i) {
        return state.better && stops[i].better !== null;
    }

    function usabilityPos(i) {
        return improved(i) ? stops[i].betterAt : N - 1 - i;
    }

    function usabilityPhrase(i) {
        return improved(i) ? stops[i].better : stops[i].usability;
    }

    // The stop whose usability position is nearest to u; on a tie, the more
    // secure (higher-numbered) stop.
    function stopForUsability(u) {
        var best = 0;
        var bestDist = Infinity;
        for (var i = 0; i < N; i++) {
            var d = Math.abs(usabilityPos(i) - u);
            if (d <= bestDist) {
                best = i;
                bestDist = d;
            }
        }
        return best;
    }

    // A one-step move (arrow key, screen-reader swipe) that would land back on
    // the same stop keeps going the same way until the stop changes, so these
    // moves never get stuck between two stops.
    function stepToward(u) {
        var target = stopForUsability(u);
        if (target === settledStop && u !== settledPos) {
            var dir = u > settledPos ? 1 : -1;
            for (var v = u + dir; v >= 0 && v <= N - 1; v += dir) {
                var t = stopForUsability(v);
                if (t !== settledStop) return t;
            }
        }
        return target;
    }

    function toPos(value) {
        var v = Math.round(Number(value));
        if (!(v >= 0)) return 0;
        return v > N - 1 ? N - 1 : v;
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
        state.stop = toPos(secSlider.value);
        dragMoved = false;  // a held usability drag must not undo this on release
        render(false);
    }
    secSlider.addEventListener('input', onSecurity);
    secSlider.addEventListener('change', onSecurity);

    // Usability slider. While a pointer (mouse, pen or finger) drags it, show
    // the nearest stop live and settle on release, so it may land one or two
    // places from where it was dropped. A press that does not move it changes
    // nothing. Any other change (keys, screen readers) is a step.
    var dragging = false;
    var dragMoved = false;
    var dragPointer = null;  // pointerId that started the drag
    var dragPointerType = '';
    var dragTouch = null;    // Touch.identifier of the finger that started it

    function settleUsability() {
        state.stop = stopForUsability(toPos(useSlider.value));
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

    useSlider.addEventListener('input', function () {
        var u = toPos(useSlider.value);
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
    useSlider.addEventListener('change', function () {
        var u = toPos(useSlider.value);
        if (dragging || u === settledPos) return;
        state.stop = stepToward(u);
        render(false);
    });

    // Switch: the stop stays; the usability slider and phrase change only if
    // the stop has a better version.
    toggle.addEventListener('change', function () {
        state.better = toggle.checked;
        dragMoved = false;  // a held usability drag must not undo this on release
        render(false);
    });

    secSlider.max = String(N - 1);
    useSlider.max = String(N - 1);
    render(false);
    app.hidden = false;
    if (fallback) fallback.hidden = true;

    // On Back/Forward without the back/forward cache, the browser restores the
    // checkbox after this script has run; put it back in step with the state.
    window.addEventListener('pageshow', function () {
        if (!dragging) render(false);
    });
})();
