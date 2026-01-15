import { chat, chat_metadata, event_types, eventSource, main_api, saveSettingsDebounced } from '../../../../script.js';
import { metadata_keys } from '../../../authors-note.js';
import { extension_settings } from '../../../extensions.js';
import { promptManager } from '../../../openai.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { delay } from '../../../utils.js';
import { world_info_position } from '../../../world-info.js';
import { isAdmin, getCurrentUserHandle } from '../../../user.js';
import { Popup, POPUP_TYPE } from '../../../popup.js';

const STWII = (window.STWII ||= {});
STWII.MAX_ACTIVATION_EVENTS = STWII.MAX_ACTIVATION_EVENTS ?? 1000;
STWII.MAX_BUILDS = STWII.MAX_BUILDS ?? 5;
STWII.MAX_BUILD_LOGS = STWII.MAX_BUILD_LOGS ?? 2000;

function pushBounded(arr, item, max) {
    try {
        arr.push(item);
        if (arr.length > max) arr.splice(0, arr.length - max);
    } catch {}
}
function trimBuilds() {
    try {
        const builds = chat_metadata.stwiiBuilds;
        if (!Array.isArray(builds)) return;
        while (builds.length > STWII.MAX_BUILDS) {
            const removed = builds.shift();
            if (removed && removed.runId != null && Array.isArray(chat_metadata.stwiiActivationEvents)) {
                chat_metadata.stwiiActivationEvents = chat_metadata.stwiiActivationEvents.filter(e => e?.runId !== removed.runId);
            }
        }
    } catch {}
}

const strategy = {
    constant: '🔵',
    normal: '🟢',
    vectorized: '🔗',
};
const getStrategy = (entry)=>{
    if (entry.constant === true) {
        return 'constant';
    } else if (entry.vectorized === true) {
        return 'vectorized';
    } else {
        return 'normal';
    }
};

let generationType;
eventSource.on(event_types.GENERATION_STARTED, (genType)=>generationType = genType);

const init = ()=>{
    if (window.STWII?.initialized) return;
    STWII.initialized = true;
    // One-time retention trimming on init
    try {
        if (Array.isArray(chat_metadata.stwiiActivationEvents) && chat_metadata.stwiiActivationEvents.length > STWII.MAX_ACTIVATION_EVENTS) {
            chat_metadata.stwiiActivationEvents.splice(0, chat_metadata.stwiiActivationEvents.length - STWII.MAX_ACTIVATION_EVENTS);
        }
        if (Array.isArray(chat_metadata.stwiiBuilds)) {
            trimBuilds();
        }
    } catch {}
    const trigger = document.createElement('div'); {
        trigger.classList.add('stwii--trigger');
        trigger.classList.add('fa-solid', 'fa-fw', 'fa-book-atlas');
        trigger.title = 'Active WI\n---\nright click for options';
        trigger.addEventListener('click', ()=>{
            panel.classList.toggle('stwii--isActive');
            requestAnimationFrame(ensurePanelsVisible);
        });
        trigger.addEventListener('contextmenu', (evt)=>{
            evt.preventDefault();
            configPanel.classList.toggle('stwii--isActive');
            requestAnimationFrame(ensurePanelsVisible);
        });
        document.body.append(trigger);
    }
    const panel = document.createElement('div'); {
        panel.classList.add('stwii--panel');
        panel.innerHTML = '?';
        document.body.append(panel);
    }
    const configPanel = document.createElement('div'); {
        configPanel.classList.add('stwii--panel');
        const rowGroup = document.createElement('label'); {
            rowGroup.classList.add('stwii--configRow');
            rowGroup.title = 'Group entries by World Info book';
            const cb = document.createElement('input'); {
                cb.type = 'checkbox';
                cb.checked = extension_settings.worldInfoInfo?.group ?? true;
                cb.addEventListener('click', ()=>{
                    if (!extension_settings.worldInfoInfo) {
                        extension_settings.worldInfoInfo = {};
                    }
                    extension_settings.worldInfoInfo.group = cb.checked;
                    updatePanel(currentEntryList);
                    saveSettingsDebounced();
                });
                rowGroup.append(cb);
            }
            const lbl = document.createElement('div'); {
                lbl.textContent = 'Group by book';
                rowGroup.append(lbl);
            }
            configPanel.append(rowGroup);
        }
        const orderRow = document.createElement('label'); {
            orderRow.classList.add('stwii--configRow');
            orderRow.title = 'Show in insertion depth / order instead of alphabetically';
            const cb = document.createElement('input'); {
                cb.type = 'checkbox';
                cb.checked = extension_settings.worldInfoInfo?.order ?? true;
                cb.addEventListener('click', ()=>{
                    if (!extension_settings.worldInfoInfo) {
                        extension_settings.worldInfoInfo = {};
                    }
                    extension_settings.worldInfoInfo.order = cb.checked;
                    updatePanel(currentEntryList);
                    saveSettingsDebounced();
                });
                orderRow.append(cb);
            }
            const lbl = document.createElement('div'); {
                lbl.textContent = 'Show in order';
                orderRow.append(lbl);
            }
            configPanel.append(orderRow);
        }
        const mesRow = document.createElement('label'); {
            mesRow.classList.add('stwii--configRow');
            mesRow.title = 'Indicate message history (only when ungrouped and shown in order)';
            const cb = document.createElement('input'); {
                cb.type = 'checkbox';
                cb.checked = extension_settings.worldInfoInfo?.mes ?? true;
                cb.addEventListener('click', ()=>{
                    if (!extension_settings.worldInfoInfo) {
                        extension_settings.worldInfoInfo = {};
                    }
                    extension_settings.worldInfoInfo.mes = cb.checked;
                    updatePanel(currentEntryList);
                    saveSettingsDebounced();
                });
                mesRow.append(cb);
            }
            const lbl = document.createElement('div'); {
                lbl.textContent = 'Show messages';
                mesRow.append(lbl);
            }
            configPanel.append(mesRow);
        }
        // Drag-to-move toggle
        const dragRow = document.createElement('label'); {
            dragRow.classList.add('stwii--configRow');
            dragRow.title = 'Allow dragging the book icon to reposition it';
            const cb = document.createElement('input'); {
                cb.type = 'checkbox';
                cb.checked = extension_settings.worldInfoInfo?.drag ?? false;
                cb.addEventListener('click', ()=>{
                    if (!extension_settings.worldInfoInfo) extension_settings.worldInfoInfo = {};
                    const wasEnabled = !!extension_settings.worldInfoInfo.drag;
                    extension_settings.worldInfoInfo.drag = cb.checked;

                    // If enabling for the first time and no saved position, convert current visual spot
                    const hasSaved = !!extension_settings.worldInfoInfo.triggerPos;
                    if (cb.checked && !wasEnabled && !hasSaved) {
                        materializeDefaultPosition();
                    }
                    saveSettingsDebounced();
                });
                dragRow.append(cb);
            }
            const lbl = document.createElement('div'); {
                lbl.textContent = 'Enable drag to move';
                dragRow.append(lbl);
            }
            configPanel.append(dragRow);
        }
        // Reset position row
        const resetRow = document.createElement('div'); {
            resetRow.classList.add('stwii--configRow');
            resetRow.title = 'Reset the book icon position to default';
            resetRow.style.userSelect = 'none';
            const resetLbl = document.createElement('div'); {
                resetLbl.textContent = 'Reset position';
                resetRow.append(resetLbl);
            }
            resetRow.addEventListener('click', ()=>{
                if (!extension_settings.worldInfoInfo) extension_settings.worldInfoInfo = {};
                delete extension_settings.worldInfoInfo.triggerPos;
                // Clear inline overrides -> back to CSS default (bottom-left)
                trigger.style.left = '';
                trigger.style.top = '';
                trigger.style.right = '';
                trigger.style.bottom = '';
                saveSettingsDebounced();
            });
            configPanel.append(resetRow);
        }
        document.body.append(configPanel);
        STWII.trigger = trigger; STWII.panel = panel; STWII.configPanel = configPanel;
    }

    // Apply saved position if present
    {
        const savedPos = extension_settings.worldInfoInfo?.triggerPos;
        if (savedPos && Number.isFinite(savedPos.left) && Number.isFinite(savedPos.top)) {
            trigger.style.left = savedPos.left + 'px';
            trigger.style.top = savedPos.top + 'px';
            trigger.style.right = 'auto';
            trigger.style.bottom = 'auto';
        }
    }

    // Drag-to-move handlers and helpers
    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    // Feature-detect CSS Anchor Positioning
    // Must check position-area as well, since Firefox reports support for position-anchor/anchor-name
    // but doesn't actually support position-area, causing incorrect positioning
    function supportsAnchors() {
        // Firefox has buggy/partial support - always use JS fallback for Firefox
        const isFirefox = /firefox/i.test(navigator.userAgent);
        if (isFirefox) {
            return false;
        }
        
        return CSS.supports?.('position-anchor: --x') 
            && CSS.supports?.('anchor-name: --x')
            && CSS.supports?.('position-area: top right');
    }

    // Measure and place a panel near the trigger, clamped to viewport
    function placePanelNearTrigger(panelEl, triggerEl, gap = 8) {
        if (!panelEl || !triggerEl) return;

        // Temporarily show to measure when hidden
        const wasHidden = getComputedStyle(panelEl).display === 'none';
        if (wasHidden) {
            panelEl.style.visibility = 'hidden';
            panelEl.style.display = 'flex';
        }

        // Use fixed positioning for robust viewport math
        // Clear any CSS positioning properties that might interfere (especially right/top from CSS)
        panelEl.style.position = 'fixed';
        panelEl.style.right = 'auto';
        panelEl.style.bottom = 'auto';
        // Clear left/top before reading trigger position to ensure clean state
        panelEl.style.left = 'auto';
        panelEl.style.top = 'auto';
        
        // Force a reflow to ensure Firefox has calculated positions correctly
        void triggerEl.offsetHeight;
        void panelEl.offsetHeight;
        
        // Always use getBoundingClientRect() for trigger position
        // It returns viewport-relative coordinates which is what we need for position: fixed panels
        // Read the position directly - getBoundingClientRect() should always return viewport coordinates
        const tr = triggerEl.getBoundingClientRect();
        const triggerLeft = tr.left;
        const triggerTop = tr.top;
        const triggerWidth = tr.width || triggerEl.offsetWidth || 0;
        const triggerHeight = tr.height || triggerEl.offsetHeight || 0;
        
        // Use the values from getBoundingClientRect() - they should be viewport coordinates
        const pw = panelEl.offsetWidth || 300;
        const ph = panelEl.offsetHeight || 200;
        
        // Prefer right side, flip to left if overflowing
        let left = triggerLeft + triggerWidth + gap;
        if (left + pw > window.innerWidth - 4) {
            left = triggerLeft - pw - gap;
        }
        left = clamp(left, 4, Math.max(4, window.innerWidth - pw - 4));

        // Align top with trigger, clamp vertically
        let top = clamp(triggerTop, 4, Math.max(4, window.innerHeight - ph - 4));

        // Force Firefox to recalculate by accessing a property that triggers timing
        // This needs to happen before isFirefoxForPositioning is defined to work
        if (typeof isFirefoxForPositioning === 'undefined' && /firefox/i.test(navigator.userAgent)) {
            // This check intentionally accesses isFirefoxForPositioning before it's defined
            // The typeof check prevents the error, but the timing effect is preserved
            void 0; // No-op to maintain the if block structure
        }

        // Now define it
        const isFirefoxForPositioning = /firefox/i.test(navigator.userAgent);
        if (isFirefoxForPositioning) {
            panelEl.style.setProperty('left', left + 'px', 'important');
            panelEl.style.setProperty('top', top + 'px', 'important');
            panelEl.style.setProperty('right', 'auto', 'important');
            panelEl.style.setProperty('bottom', 'auto', 'important');
        } else {
            panelEl.style.left = left + 'px';
            panelEl.style.top = top + 'px';
            panelEl.style.right = 'auto';
            panelEl.style.bottom = 'auto';
        }

        if (wasHidden) {
            panelEl.style.visibility = '';
            panelEl.style.display = ''; // back to CSS control (.stwii--isActive)
        }
    }

    // Ensure visible placement for panels when toggled/dragged/resized
    function ensurePanelsVisible() {
        // If anchors are supported but render offscreen due to partial/buggy support, clamp anyway
        const checkAndClampIfOffscreen = (el) => {
            if (!el || !el.classList.contains('stwii--isActive')) return;
            const r = el.getBoundingClientRect();
            const off = (r.left < 0) || (r.right > window.innerWidth) || (r.top < 0) || (r.bottom > window.innerHeight);
            if (off) placePanelNearTrigger(el, trigger);
        };

        if (supportsAnchors()) {
            checkAndClampIfOffscreen(panel);
            checkAndClampIfOffscreen(configPanel);
            return;
        }

        // Always use requestAnimationFrame to ensure layout is complete
        // Firefox may need extra time to calculate positions correctly
        requestAnimationFrame(() => {
            if (panel.classList.contains('stwii--isActive')) {
                placePanelNearTrigger(panel, trigger);
            }
            if (configPanel.classList.contains('stwii--isActive')) {
                placePanelNearTrigger(configPanel, trigger);
            }
        });
    }

    function materializeDefaultPosition() {
        // Convert current visual placement (bottom/left CSS) to top/left pixels
        const rect = trigger.getBoundingClientRect();
        const left = rect.left;
        const top = rect.top;
        trigger.style.left = left + 'px';
        trigger.style.top = top + 'px';
        trigger.style.right = 'auto';
        trigger.style.bottom = 'auto';
        if (!extension_settings.worldInfoInfo) extension_settings.worldInfoInfo = {};
        extension_settings.worldInfoInfo.triggerPos = { left, top };
    }

    let dragging = false;
    let dragStartX = 0, dragStartY = 0;
    let baseLeft = 0, baseTop = 0;
    let movedEnough = false;
    let suppressNextClick = false;

    function onPointerDown(e) {
        if (!(extension_settings.worldInfoInfo?.drag)) return; // dragging disabled
        if (e.button !== 0 && e.pointerType !== 'touch') return; // left mouse or touch
        dragging = true;
        movedEnough = false;
        dragStartX = e.clientX;
        dragStartY = e.clientY;

        // compute current position
        const rect = trigger.getBoundingClientRect();
        baseLeft = rect.left;
        baseTop = rect.top;

        trigger.style.touchAction = 'none';
        trigger.setPointerCapture?.(e.pointerId);
        e.preventDefault();
    }

    function onPointerMove(e) {
        if (!dragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        if (!movedEnough && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) movedEnough = true;

        const newLeft = clamp(baseLeft + dx, 0, window.innerWidth - trigger.offsetWidth);
        const newTop = clamp(baseTop + dy, 0, window.innerHeight - trigger.offsetHeight);

        // switch to top/left based positioning
        trigger.style.left = newLeft + 'px';
        trigger.style.top = newTop + 'px';
        trigger.style.right = 'auto';
        trigger.style.bottom = 'auto';
    }

    function endDrag(e) {
        if (!dragging) return;
        dragging = false;
        trigger.releasePointerCapture?.(e.pointerId);
        trigger.style.touchAction = '';

        // persist if moved
        if (movedEnough) {
            const rect = trigger.getBoundingClientRect();
            if (!extension_settings.worldInfoInfo) extension_settings.worldInfoInfo = {};
            extension_settings.worldInfoInfo.triggerPos = { left: rect.left, top: rect.top };
            saveSettingsDebounced();
            suppressNextClick = true;
            setTimeout(() => suppressNextClick = false, 250);
        }

        // Re-place open panels after drag
        requestAnimationFrame(ensurePanelsVisible);
    }

    trigger.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    // Prevent click toggle if a drag just occurred (capture phase)
    trigger.addEventListener('click', (e) => {
        if (suppressNextClick) {
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    }, true);

    // Ensure the saved position stays visible on resize
    window.addEventListener('resize', () => {
        const pos = extension_settings.worldInfoInfo?.triggerPos;
        if (pos) {
            const clampedLeft = clamp(pos.left, 0, window.innerWidth - trigger.offsetWidth);
            const clampedTop = clamp(pos.top, 0, window.innerHeight - trigger.offsetHeight);
            if (clampedLeft !== pos.left || clampedTop !== pos.top) {
                pos.left = clampedLeft;
                pos.top = clampedTop;
                trigger.style.left = clampedLeft + 'px';
                trigger.style.top = clampedTop + 'px';
                saveSettingsDebounced();
            }
        }

        // After trigger potentially moved, place visible panels
        ensurePanelsVisible();
    });

    let entries = [];

    let count = -1;
    const updateBadge = async(newEntries)=>{
        if (count != newEntries.length) {
            if (newEntries.length == 0) {
                trigger.classList.add('stwii--badge-out');
                await delay(510);
                trigger.setAttribute('data-stwii--badge-count', newEntries.length.toString());
                trigger.classList.remove('stwii--badge-out');
            } else if (count == 0) {
                trigger.classList.add('stwii--badge-in');
                trigger.setAttribute('data-stwii--badge-count', newEntries.length.toString());
                await delay(510);
                trigger.classList.remove('stwii--badge-in');
            } else {
                trigger.setAttribute('data-stwii--badge-count', newEntries.length.toString());
                trigger.classList.add('stwii--badge-bounce');
                await delay(1010);
                trigger.classList.remove('stwii--badge-bounce');
            }
            count = newEntries.length;
        } else if (new Set(newEntries).difference(new Set(entries)).size > 0) {
            trigger.classList.add('stwii--badge-bounce');
            await delay(1010);
            trigger.classList.remove('stwii--badge-bounce');
        }
        entries = newEntries;
    };
    let currentEntryList = [];
    let currentChat = [];
    eventSource.on(event_types.WORLD_INFO_ACTIVATED, async(entryList)=>{
        panel.innerHTML = 'Updating...';

        // Exclude disabled entries
        const filtered = entryList.filter(e => e?.disable !== true);

        updateBadge(filtered.map(it=>`${it.world}§§§${it.uid}`));

        for (const entry of filtered) {
            entry.type = 'wi';
            entry.sticky = parseInt(/**@type {string}*/(await SlashCommandParser.commands['wi-get-timed-effect'].callback(
                {
                    effect: 'sticky',
                    format: 'number',
                    file: `${entry.world}`,
                    _scope: null,
                    _abortController: null,
                },
                entry.uid,
            )));
        }

        currentEntryList = [...filtered];

        if (filtered.length === 0) {
            panel.innerHTML = 'No active entries';
            updatePanel(filtered, true);
            return;
        }

        updatePanel(filtered, true);
    });


    const updatePanel = (entryList, newChat = false)=>{
        const isGrouped = extension_settings.worldInfoInfo?.group ?? true;
        const isOrdered = extension_settings.worldInfoInfo?.order ?? true;
        const isMes = extension_settings.worldInfoInfo?.mes ?? true;
        panel.innerHTML = '';
        const adminBypass = isAdmin();

        // Panel-only per-user visibility for Z- lorebooks.
        // - Exempt "9Z Universal Commands" (visible to everyone)
        // - Z-<handle>-* is visible only to matching user (admins see all)
        // - Other 9Z remain hidden for non-admins
        const norm = (s) => (typeof s === 'string' ? s : '').trim();

        // Extract single handle after "Z-", e.g. "Z-alice-..." => "alice"
        // Allows "Z-alice" (no trailing dash) as well.
        const extractZHandle = (world) => {
            const m = norm(world).match(/^Z-([^-\s]+)(?:-|$)/);
            return m ? m[1] : null;
        };

        // Provided by the host app; fallback to empty if unavailable.
        const currentHandle = (typeof getCurrentUserHandle === 'function' ? getCurrentUserHandle() : '')
            .trim();

        const isHiddenWorld = (w)=> {
            const s = norm(w);
            if (s === '9z universal commands') return false; // exemption

            // Per-user visibility for Z- lorebooks:
            const h = extractZHandle(s);
            if (h) {
                // Hide if the embedded handle does not match the current user
                return h !== currentHandle;
            }

            // Keep other 9Z hidden for non-admins
            return s.startsWith('9Z');
        };
        let grouped;
        if (isGrouped) {
            grouped = Object.groupBy(entryList, (it,idx)=>it.world);
        } else {
            grouped = {
                'WI Entries': [...entryList],
            };
        }
        const depthPos = [world_info_position.ANBottom, world_info_position.ANTop, world_info_position.atDepth];
        for (const [world, entries] of Object.entries(grouped)) {
            for (const e of entries) {
                e.depth = e.position == world_info_position.atDepth ? e.depth : (chat_metadata[metadata_keys.depth] + (e.position == world_info_position.ANTop ? 0.1 : 0));
            }
            const w = document.createElement('div'); {
                w.classList.add('stwii--world');
                w.textContent = world;
                panel.append(w);
                if (!adminBypass && isGrouped && isHiddenWorld(world)) {
                    const placeholder = document.createElement('div'); {
                        placeholder.classList.add('stwii--entry');
                        placeholder.title = '';
                        const strat = document.createElement('div'); {
                            strat.classList.add('stwii--strategy');
                            placeholder.append(strat);
                        }
                        const title = document.createElement('div'); {
                            title.classList.add('stwii--title');
                            title.textContent = '(hidden entries)';
                            placeholder.append(title);
                        }
                        const sticky = document.createElement('div'); {
                            sticky.classList.add('stwii--sticky');
                            sticky.textContent = '';
                            sticky.title = '';
                            placeholder.append(sticky);
                        }
                        panel.append(placeholder);
                    }
                    continue;
                }
                entries.sort((a,b)=>{
                    if (isOrdered) {
                        // order by strategy / depth / order
                        if (!depthPos.includes(a.position) && !depthPos.includes(b.position)) return a.position - b.position;
                        if (depthPos.includes(a.position) && !depthPos.includes(b.position)) return 1;
                        if (!depthPos.includes(a.position) && depthPos.includes(b.position)) return -1;
                        if ((a.depth ?? Number.MAX_SAFE_INTEGER) < (b.depth ?? Number.MAX_SAFE_INTEGER)) return 1;
                        if ((a.depth ?? Number.MAX_SAFE_INTEGER) > (b.depth ?? Number.MAX_SAFE_INTEGER)) return -1;
                        if ((a.order ?? Number.MAX_SAFE_INTEGER) > (b.order ?? Number.MAX_SAFE_INTEGER)) return 1;
                        if ((a.order ?? Number.MAX_SAFE_INTEGER) < (b.order ?? Number.MAX_SAFE_INTEGER)) return -1;
                        return (a.comment ?? a.key.join(', ')).toLowerCase().localeCompare((b.comment ?? b.key.join(', ')).toLowerCase());
                    } else {
                        // order alphabetically
                        return (a.comment?.length ? a.comment : a.key.join(', '))
                            .toLowerCase()
                            .localeCompare(b.comment?.length ? b.comment : b.key.join(', '))
                        ;
                    }
                });
                if (!isGrouped && isOrdered && isMes) {
                    const an = chat_metadata[metadata_keys.prompt];
                    const ad = chat_metadata[metadata_keys.depth];
                    if (an?.length) {
                        const idx = entries.findIndex(e=>depthPos.includes(e.position) && e.depth <= ad);
                        entries.splice(idx, 0, {
                            type: 'note',
                            position: world_info_position.ANBottom,
                            depth: ad,
                            text: an,
                        });
                    }
                    if (newChat) {
                        currentChat = [...chat];
                        if (generationType == 'swipe') currentChat.pop();
                    }
                    const segmenter = new Intl.Segmenter('en', { granularity:'sentence' });
                    let currentDepth = currentChat.length - 1;
                    let isDumped = false;
                    for (let i = entries.length - 1; i >= -1; i--) {
                        if (i < 0 && currentDepth < 0) continue;
                        if (isDumped) continue;
                        if ((i < 0 && currentDepth >= 0) || !depthPos.includes(entries[i].position)) {
                            // anything not @D is considered as "before chat"
                            isDumped = true;
                            const depth = -1;
                            const mesList = currentChat.slice(depth + 1, currentDepth + 1);
                            const text = mesList
                                .map(it=>it.mes)
                                .map(it=>it
                                    .replace(/```.+```/gs, '')
                                    .replace(/<[^>]+?>/g, '')
                                    .trim()
                                    ,
                                )
                                .filter(it=>it.length)
                                .join('\n')
                            ;
                            const sentences = [...segmenter.segment(text)].map(it=>it.segment.trim());
                            entries.splice(i + 1, 0, {
                                type: 'mes',
                                count: mesList.length,
                                from: depth + 1,
                                to: currentDepth,
                                first: sentences.at(0),
                                last: sentences.length > 1 ? sentences.at(-1) : null,
                            });
                            currentDepth = -1;
                            continue;
                        }
                        let depth = Math.max(-1, currentChat.length - entries[i].depth - 1);
                        if (depth >= currentDepth) continue;
                        depth = Math.ceil(depth);
                        if (depth == currentDepth) continue;
                        const mesList = currentChat.slice(depth + 1, currentDepth + 1);
                        const text = mesList
                            .map(it=>it.mes)
                            .map(it=>it
                                .replace(/```.+```/gs, '')
                                .replace(/<[^>]+?>/g, '')
                                .trim()
                                ,
                            )
                            .filter(it=>it.length)
                            .join('\n')
                        ;
                        const sentences = [...segmenter.segment(text)].map(it=>it.segment.trim());
                        entries.splice(i + 1, 0, {
                            type: 'mes',
                            count: mesList.length,
                            from: depth + 1,
                            to: currentDepth,
                            first: sentences.at(0),
                            last: sentences.length > 1 ? sentences.at(-1) : null,
                        });
                        currentDepth = depth;
                    }
                }
                let hadHidden = false;
                for (const entry of entries) {
                    if (!adminBypass && !isGrouped && isHiddenWorld(entry.world)) { hadHidden = true; continue; }
                    const e = document.createElement('div'); {
                        e.classList.add('stwii--entry');
                        const wipChar = [world_info_position.before, world_info_position.after];
                        const wipEx = [world_info_position.EMTop, world_info_position.EMBottom];
                        e.title = '';
                        if (entry.type == 'mes') e.classList.add('stwii--messages');
                        if (entry.type == 'note') e.classList.add('stwii--note');
                        const strat = document.createElement('div'); {
                            strat.classList.add('stwii--strategy');
                            if (entry.type == 'wi') {
                                strat.textContent = strategy[getStrategy(entry)];
                            } else if (entry.type == 'mes') {
                                strat.classList.add('fa-solid', 'fa-fw', 'fa-comments');
                                strat.setAttribute('data-stwii--count', entry.count.toString());
                            } else if (entry.type == 'note') {
                                strat.classList.add('fa-solid', 'fa-fw', 'fa-note-sticky');
                            }
                            e.append(strat);
                        }
                        const title = document.createElement('div'); {
                            title.classList.add('stwii--title');
                            if (entry.type == 'wi') {
                                title.textContent = entry.comment?.length ? entry.comment : entry.key.join(', ');
                                e.title += `[${entry.world}] ${entry.comment?.length ? entry.comment : entry.key.join(', ')}\n---\n${entry.content}`;
                            } else if (entry.type == 'mes') {
                                const first = document.createElement('div'); {
                                    first.classList.add('stwii--first');
                                    first.textContent = entry.first;
                                    title.append(first);
                                }
                                if (entry.last) {
                                    e.title = `Messages #${entry.from}-${entry.to}\n---\n${entry.first}\n...\n${entry.last}`;
                                    const sep = document.createElement('div'); {
                                        sep.classList.add('stwii--sep');
                                        sep.textContent = '...';
                                        title.append(sep);
                                    }
                                    const last = document.createElement('div'); {
                                        last.classList.add('stwii--last');
                                        last.textContent = entry.last;
                                        title.append(last);
                                    }
                                } else {
                                    e.title = `Message #${entry.from}\n---\n${entry.first}`;
                                }
                            } else if (entry.type == 'note') {
                                title.textContent = 'Author\'s Note';
                                e.title = `Author's Note\n---\n${entry.text}`;
                            }
                            e.append(title);
                        }
                        const sticky = document.createElement('div'); {
                            sticky.classList.add('stwii--sticky');
                            sticky.textContent = entry.sticky ? `📌 ${entry.sticky}` : '';
                            sticky.title = `Sticky for ${entry.sticky} more rounds`;
                            e.append(sticky);
                        }
                        panel.append(e);
                    }
                }
                if (!adminBypass && !isGrouped && hadHidden) {
                    const placeholder = document.createElement('div'); {
                        placeholder.classList.add('stwii--entry');
                        placeholder.title = '';
                        const strat = document.createElement('div'); {
                            strat.classList.add('stwii--strategy');
                            placeholder.append(strat);
                        }
                        const title = document.createElement('div'); {
                            title.classList.add('stwii--title');
                            title.textContent = '(hidden entries)';
                            placeholder.append(title);
                        }
                        const sticky = document.createElement('div'); {
                            sticky.classList.add('stwii--sticky');
                            sticky.textContent = '';
                            sticky.title = '';
                            placeholder.append(sticky);
                        }
                        panel.append(placeholder);
                    }
                }
            }
        }
    };

    // Build session tracking based on engine markers
    let stwiiCurrentBuild = null;
    // Per-run loop counts (for latest non-dry run), and dry-run flag
    let stwiiCurrentLoopCounts = null;
    // Per-run loop entry IDs (exact order for each loop, from engine array dumps)
    let stwiiCurrentLoopEntryIds = null;
    // Per-run loop entry IDs captured incrementally during LOOP START/RESULT using activation commits
    let stwiiCurrentLoopEventIds = null;
    // Currently active loop index (-1 when not within a loop)
    let stwiiActiveLoopIndex = -1;
    let stwiiDryRunActive = false;
function startBuildSession() {
        STWII.currentRunId = Date.now();
        stwiiCurrentBuild = { runId: STWII.currentRunId, startedAt: Date.now(), added: [], logs: [] };
    }
function endBuildSession() {
        if (!stwiiCurrentBuild) return;
        if (!Array.isArray(chat_metadata.stwiiBuilds)) chat_metadata.stwiiBuilds = [];
        chat_metadata.stwiiBuilds.push(stwiiCurrentBuild);
        // Enforce retention: last 5 builds; purge global events for dropped builds
        trimBuilds();
        stwiiCurrentBuild = null;
    }

    // WI activation log capture (no changes to world-info.js)
    const activationDrafts = new Map();
    // Track last seen world for a given numeric UID (engine logs sometimes omit the world on follow-up lines)
    const lastWorldByUid = new Map();

    // Build composite key helper "World:UID" or placeholder "?:UID" when world is unknown
    function makeDraftKey(uid, world) {
        const w = (typeof world === 'string' && world.length) ? world : null;
        return w ? `${w}:${uid}` : `?:${uid}`;
    }
    function parseWiUIDFromFirstArg(a0) {
        if (typeof a0 !== 'string') return null;
        const m = a0.match(/\[WI\]\s+Entry\s+(\d+)/);
        return m ? Number(m[1]) : null;
    }
    function ensureEventArray() {
        if (!Array.isArray(chat_metadata.stwiiActivationEvents)) chat_metadata.stwiiActivationEvents = [];
    }
    function upsertDraft(uid, worldOpt) {
        // Prefer explicit world; fallback to last seen for this uid
        const world = worldOpt || lastWorldByUid.get(uid) || null;

        // If we now know the world, migrate any placeholder draft (?:uid) to composite
        const placeholderKey = makeDraftKey(uid, null);
        const key = makeDraftKey(uid, world);

        if (world && activationDrafts.has(placeholderKey) && !activationDrafts.has(key)) {
            activationDrafts.set(key, activationDrafts.get(placeholderKey));
            activationDrafts.delete(placeholderKey);
        }

        if (!activationDrafts.has(key)) {
            activationDrafts.set(key, { primary: null, secondary: [], secondaryNon: [], logic: null });
        }
        return activationDrafts.get(key);
    }
    function handleWiDebugArgs(args) {
        if (!args || args.length === 0) return;
        const a0 = args[0];
        const uid = parseWiUIDFromFirstArg(a0);
        if (uid == null) return;

        const a1 = args[1];
        const a2 = args[2];

        // Normalize first arg as text (some WI logs are emitted as a single string line)
        const text0 = (typeof a0 === 'string') ? a0 : '';

        // Try to capture world name on "processing" lines: "[WI] Entry N from 'World' processing ..."
        let worldFromLine = null;
        try {
            const mW = text0.match(/\bfrom\s+'([^']+)'\s+processing/i);
            if (mW && mW[1]) worldFromLine = mW[1];
        } catch {}
        if (worldFromLine) {
            lastWorldByUid.set(uid, worldFromLine);
        }

        // Support single-line formats to capture primary/secondary/logic from a0
        try {
            // Primary key match inline:
            // e.g. "[WI] Entry 11 activated by primary key match kidnapped"
            const mPrimLine = text0.match(/\[WI\]\s+Entry\s+\d+.*?activated by primary key match\s+(.+)/i);
            if (mPrimLine && mPrimLine[1]) {
                const d = upsertDraft(uid, worldFromLine);
                d.primary = mPrimLine[1].trim();
            }

            // Also capture when the engine logs "Entry with primary key match X has secondary keywords"
            // This often appears one line after "processing" and before the "(AND ANY) activated" line.
            // Example: "Entry 21 Entry with primary key match custom has secondary keywords. Checking with logic logic (2) ['AND_ANY', 0]"
            const mPrimHasSecondary = text0.match(/\bEntry with primary key match\s+(.+?)\s+has secondary keywords/i);
            if (mPrimHasSecondary && mPrimHasSecondary[1]) {
                const d = upsertDraft(uid, worldFromLine);
                // Do not overwrite an already captured primary
                d.primary = d.primary || mPrimHasSecondary[1].trim();
            }

            // Capture logic indicator when printed in the "Checking with logic logic (N) ['AND_ANY', 0]" form
            const mLogicBracket = text0.match(/Checking with logic\s+logic\s*\(\d+\)\s*\[['"]?(AND_ANY|AND_ALL|NOT_ANY|NOT_ALL)['"]?/i);
            if (mLogicBracket && mLogicBracket[1]) {
                const d = upsertDraft(uid, worldFromLine);
                d.logic = d.logic ?? mLogicBracket[1]; // keep underscore variant; renderer maps to display text
            }

            // Secondary captures inline (AND ANY)
            const mSecAndAny = text0.match(/\(AND ANY\)\s*Found match secondary keyword\s+(.+)/i);
            if (mSecAndAny && mSecAndAny[1]) {
            const d = upsertDraft(uid, worldFromLine);
                d.secondary.push(mSecAndAny[1].trim());
                d.logic = d.logic ?? 'AND_ANY';
            }

            // Secondary captures inline (NOT ALL)
            const mSecNotAll = text0.match(/\(NOT ALL\)\s*Found not matching secondary keyword\s+(.+)/i);
            if (mSecNotAll && mSecNotAll[1]) {
            const d = upsertDraft(uid, worldFromLine);
                d.secondaryNon.push(mSecNotAll[1].trim());
                d.logic = d.logic ?? 'NOT_ALL';
            }

            // Secondary logic inline (NOT ANY)
            if (/\(NOT ANY\)\s*No secondary keywords found/i.test(text0)) {
            const d = upsertDraft(uid, worldFromLine);
                d.logic = 'NOT_ANY';
            }

            // Secondary logic inline (AND ALL)
            if (/\(AND ALL\)\s*All secondary keywords found/i.test(text0)) {
            const d = upsertDraft(uid, worldFromLine);
                d.logic = 'AND_ALL';
            }

            // Priority winner inline
            if (/activated as prio winner/i.test(text0)) {
            const d = upsertDraft(uid, worldFromLine);
                d.logic = d.logic ?? 'PRIO_WINNER';
            }

            // Constant inline
            if (/activated because of constant/i.test(text0)) {
            const d = upsertDraft(uid, worldFromLine);
                d.logic = d.logic ?? 'CONSTANT';
            }
        } catch {}

        // Primary matched
        if (a1 === 'activated by primary key match') {
            const d = upsertDraft(uid);
            if (typeof a2 === 'string') d.primary = a2;
            return;
        }

        // Secondary logic captures
        if (a1 === 'activated. (AND ANY) Found match secondary keyword') {
            const d = upsertDraft(uid);
            if (typeof a2 === 'string') d.secondary.push(a2);
            d.logic = d.logic ?? 'AND_ANY';
            return;
        }

        if (a1 === 'activated. (NOT ALL) Found not matching secondary keyword') {
            const d = upsertDraft(uid);
            if (typeof a2 === 'string') d.secondaryNon.push(a2);
            d.logic = d.logic ?? 'NOT_ALL';
            return;
        }

        if (a1 === 'activated. (NOT ANY) No secondary keywords found') {
            const d = upsertDraft(uid);
            d.logic = 'NOT_ANY';
            return;
        }

        if (a1 === 'activated. (AND ALL) All secondary keywords found') {
            const d = upsertDraft(uid);
            d.logic = 'AND_ALL';
            return;
        }

        // Priority winner (inclusion group) capture
        if (typeof a1 === 'string' && a1.startsWith('activated as prio winner')) {
            const d = upsertDraft(uid);
            d.logic = d.logic ?? 'PRIO_WINNER';
            return;
        }

        // Constant activation message (legacy/supportive)
        if (typeof a1 === 'string' && a1.startsWith('activated because of constant')) {
            const d = upsertDraft(uid);
            d.logic = d.logic ?? 'CONSTANT';
            return;
        }

        // Final activation commit
        if (typeof a0 === 'string' && a0.includes('activation successful, adding to prompt')) {
            const entryObj = args[1];
            if (!entryObj || typeof entryObj !== 'object') return;
            const compKey = makeDraftKey(entryObj.uid, entryObj.world);
            const placeholderKey = makeDraftKey(entryObj.uid, null);
            const d = activationDrafts.get(compKey) || activationDrafts.get(placeholderKey) || { primary: null, secondary: [], secondaryNon: [], logic: null };

            ensureEventArray();
            // Fallback: if AND_ALL but no captured secondaries, include all entry secondaries
            const sec = (d.logic === 'AND_ALL' && (!d.secondary || d.secondary.length === 0) && Array.isArray(entryObj.keysecondary))
                ? [...entryObj.keysecondary]
                : (d.secondary || []);

            const ev = {
                ts: Date.now(),
                world: entryObj.world,
                uid: entryObj.uid,
                comment: entryObj.comment ?? '',
                constant: entryObj.constant === true,
                vectorized: entryObj.vectorized === true,
                keys: Array.isArray(entryObj.key) ? [...entryObj.key] : [],
                primary: d.primary,
                secondary: sec,
                logic: d.logic,
                reason: (() => {
                    if (entryObj.constant === true) return 'constant';
                    if (typeof d.primary === 'string' && d.primary.length) return 'primary';
                    if (['AND_ANY','AND_ALL','NOT_ANY','NOT_ALL'].includes(d.logic)) return 'secondary';
                    if (entryObj.vectorized === true) return 'vector';
                    if (d.logic === 'PRIO_WINNER') return 'prio_winner';
                    return 'other';
                })(),
            };

            ev.runId = (stwiiCurrentBuild && stwiiCurrentBuild.runId) ? stwiiCurrentBuild.runId : (window.STWII?.currentRunId ?? null);
            ensureEventArray();
            pushBounded(chat_metadata.stwiiActivationEvents, ev, STWII.MAX_ACTIVATION_EVENTS);

            // Track per-loop event IDs if inside a loop
            if (Array.isArray(stwiiCurrentLoopEventIds) && stwiiActiveLoopIndex >= 0) {
                while (stwiiCurrentLoopEventIds.length <= stwiiActiveLoopIndex) stwiiCurrentLoopEventIds.push([]);
                stwiiCurrentLoopEventIds[stwiiActiveLoopIndex].push(`${entryObj.world}:${entryObj.uid}`);
            }

            // Track in current build session if present
            if (stwiiCurrentBuild) stwiiCurrentBuild.added.push(ev);

            activationDrafts.delete(compKey);
            activationDrafts.delete(placeholderKey);
            return;
        }
    }

    //! HACK: no event when no entries are activated, only a debug message
    (function(){
        const STWII = (window.STWII ||= {});
        if (STWII.consolePatched) return;
        STWII.origDebug = console.debug;
        STWII.origLog = console.log;
    const original_debug = console.debug;
    console.debug = function(...args) {
        // capture WI activation details
        try { handleWiDebugArgs(args); } catch {}

        // Track build session boundaries and capture counts (ignore DRY RUNs)
        try {
            const first = String(args[0] ?? '');
            const asText = args.map(a => (typeof a === 'string' ? a : '')).join(' ');
            if (stwiiCurrentBuild && asText) pushBounded(stwiiCurrentBuild.logs, asText, STWII.MAX_BUILD_LOGS);

            // Start/end markers
            if (asText.includes('[WI] --- START WI SCAN') && !stwiiCurrentBuild) startBuildSession();
            if (first.includes('--- BUILDING PROMPT ---') && !stwiiCurrentBuild) startBuildSession();
            if (first.includes('--- DONE ---')) endBuildSession();

            // Detect WI scan start to reset loop counts; track DRY RUNs
            if (asText.includes('[WI] --- START WI SCAN')) {
                stwiiDryRunActive = asText.includes('(DRY RUN)');
                stwiiCurrentLoopCounts = [];
                stwiiCurrentLoopEntryIds = [];
                stwiiCurrentLoopEventIds = [];
                stwiiActiveLoopIndex = -1;
            }

            // Capture per-loop counts (non-dry run only), and try to capture the array of entries printed by engine
            const mLoop = asText.match(/Successfully\s+activated\s+(\d+)\s+new\s+entries\s+to\s+prompt/i);
            if (mLoop && !stwiiDryRunActive && Array.isArray(stwiiCurrentLoopCounts)) {
                const n = Number(mLoop[1]);
                if (Number.isFinite(n)) {
                    stwiiCurrentLoopCounts.push(n);
                    if (Array.isArray(stwiiCurrentLoopEntryIds)) {
                        let ids = null;
                        try {
                            for (const arg of args) {
                                if (Array.isArray(arg) && arg.length === n && arg.every(o => o && typeof o === 'object' && ('uid' in o) && ('world' in o))) {
                                    ids = arg.map(o => `${o.world}:${o.uid}`);
                                    break;
                                }
                            }
                        } catch {}
                        stwiiCurrentLoopEntryIds.push(ids);
                    }
                }
            }

            // On BUILDING PROMPT, finalize loop counts (and captured entry IDs) for non-dry run
            if (asText.includes('[WI] --- BUILDING PROMPT ---') && !stwiiDryRunActive && Array.isArray(stwiiCurrentLoopCounts)) {
                chat_metadata.stwiiLastLoopCounts = [...stwiiCurrentLoopCounts];
                if (Array.isArray(stwiiCurrentLoopEntryIds)) {
                    chat_metadata.stwiiLastLoopEntryIds = stwiiCurrentLoopEntryIds.map(a => Array.isArray(a) ? [...a] : null);
                }
            }

            // Capture final "Adding N entries to prompt" (ignore "Hypothetically")
            const mAdd = asText.match(/\[\s*WI\s*\]\s+Adding\s+(\d+)\s+entries\s+to\s+prompt\b/i);
            if (mAdd && !stwiiDryRunActive) {
                const n = Number(mAdd[1]);
                if (Number.isFinite(n)) chat_metadata.stwiiLastAddedCount = n;
            }
        } catch {}

        const triggers = [
            '[WI] Found 0 world lore entries. Sorted by strategy',
            '[WI] Adding 0 entries to prompt',
        ];
        if (triggers.includes(args[0])) {
            panel.innerHTML = 'No active entries';
            updateBadge([]);
            currentEntryList = [];
        }
        return original_debug.bind(console)(...args);
    };
    const original_log = console.log;
    console.log = function(...args) {
        // capture WI activation details (just in case)
        try { handleWiDebugArgs(args); } catch {}

        // Track build session boundaries and capture counts (ignore DRY RUNs)
        try {
            const first = String(args[0] ?? '');
            const asText = args.map(a => (typeof a === 'string' ? a : '')).join(' ');
            if (stwiiCurrentBuild && asText) pushBounded(stwiiCurrentBuild.logs, asText, STWII.MAX_BUILD_LOGS);

            // Start/end markers
            if (asText.includes('[WI] --- START WI SCAN') && !stwiiCurrentBuild) startBuildSession();
            if (first.includes('--- BUILDING PROMPT ---') && !stwiiCurrentBuild) startBuildSession();
            if (first.includes('--- DONE ---')) endBuildSession();

            // Loop delimiters for per-loop collection
            const mLoopStart = asText.match(/\[WI\]\s+---\s+LOOP\s+#(\d+)\s+START\s+---/i);
            if (mLoopStart && Array.isArray(stwiiCurrentLoopEventIds)) {
                const idx = Number(mLoopStart[1]) - 1;
                if (Number.isFinite(idx) && idx >= 0) {
                    while (stwiiCurrentLoopEventIds.length <= idx) stwiiCurrentLoopEventIds.push([]);
                    stwiiActiveLoopIndex = idx;
                }
            }
            const mLoopResult = asText.match(/\[WI\]\s+---\s+LOOP\s+#(\d+)\s+RESULT\s+---/i);
            if (mLoopResult) {
                stwiiActiveLoopIndex = -1;
            }

            // Detect WI scan start to reset loop counts; track DRY RUNs
            if (asText.includes('[WI] --- START WI SCAN')) {
                stwiiDryRunActive = asText.includes('(DRY RUN)');
                stwiiCurrentLoopCounts = [];
                stwiiCurrentLoopEntryIds = [];
            }

            // Capture per-loop counts (non-dry run only), and try to capture the array of entries printed by engine
            const mLoop = asText.match(/Successfully\s+activated\s+(\d+)\s+new\s+entries\s+to\s+prompt/i);
            if (mLoop && !stwiiDryRunActive && Array.isArray(stwiiCurrentLoopCounts)) {
                const n = Number(mLoop[1]);
                if (Number.isFinite(n)) {
                    stwiiCurrentLoopCounts.push(n);
                    if (Array.isArray(stwiiCurrentLoopEntryIds)) {
                        let ids = null;
                        try {
                            for (const arg of args) {
                                if (Array.isArray(arg) && arg.length === n && arg.every(o => o && typeof o === 'object' && ('uid' in o) && ('world' in o))) {
                                    ids = arg.map(o => `${o.world}:${o.uid}`);
                                    break;
                                }
                            }
                        } catch {}
                        stwiiCurrentLoopEntryIds.push(ids);
                    }
                }
            }

            // On BUILDING PROMPT, finalize loop counts (and captured entry IDs) for non-dry run
            if (asText.includes('[WI] --- BUILDING PROMPT ---') && !stwiiDryRunActive && Array.isArray(stwiiCurrentLoopCounts)) {
                chat_metadata.stwiiLastLoopCounts = [...stwiiCurrentLoopCounts];
                // Prefer ids captured via LOOP START/RESULT + activation commits; fallback to ids captured from success-line arrays
                let finalIds = null;
                if (Array.isArray(stwiiCurrentLoopEventIds) && stwiiCurrentLoopEventIds.some(a => Array.isArray(a) && a.length)) {
                    finalIds = stwiiCurrentLoopEventIds.map(a => Array.isArray(a) ? [...a] : null);
                } else if (Array.isArray(stwiiCurrentLoopEntryIds)) {
                    finalIds = stwiiCurrentLoopEntryIds.map(a => Array.isArray(a) ? [...a] : null);
                }
                if (finalIds) {
                    chat_metadata.stwiiLastLoopEntryIds = finalIds;
                }
            }

            // Capture final "Adding N entries to prompt" (ignore "Hypothetically")
            const mAdd = asText.match(/\[\s*WI\s*\]\s+Adding\s+(\d+)\s+entries\s+to\s+prompt\b/i);
            if (mAdd && !stwiiDryRunActive) {
                const n = Number(mAdd[1]);
                if (Number.isFinite(n)) chat_metadata.stwiiLastAddedCount = n;
            }
        } catch {}

        const triggers = [
            '[WI] Found 0 world lore entries. Sorted by strategy',
            '[WI] Adding 0 entries to prompt',
        ];
        if (triggers.includes(args[0])) {
            panel.innerHTML = 'No active entries';
            updateBadge([]);
            currentEntryList = [];
        }
        return original_log.bind(console)(...args);
    };
    STWII.unpatchConsole = function() {
        try { console.debug = STWII.origDebug; } catch {}
        try { console.log = STWII.origLog; } catch {}
        STWII.consolePatched = false;
    };
    STWII.consolePatched = true;
})();

// Optional teardown to remove UI and unpatch console
window.STWII.destroy = function() {
    try { window.STWII.unpatchConsole?.(); } catch {}
    try {
        const t = window.STWII.trigger;
        if (t && t.parentNode) t.parentNode.removeChild(t);
        const p = window.STWII.panel;
        if (p && p.parentNode) p.parentNode.removeChild(p);
        const c = window.STWII.configPanel;
        if (c && c.parentNode) c.parentNode.removeChild(c);
    } catch {}
    window.STWII.initialized = false;
};

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'wi-triggered',
        callback: (args, value)=>{
            return JSON.stringify(currentEntryList);
        },
        returns: 'list of triggered WI entries',
        helpString: 'Get the list of World Info entries triggered on the last generation.',
    }));

    // Generate a keyword frequency report from captured activation events (popup with declared options)
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'wi-report',
        returns: 'opens popup',
        helpString: 'Show keywords that triggered WI entries (most frequent first) in a scrollable popup. Usage: /wi-report',
        callback: async () => {
            // Prefer last complete build session; fallback to the last "Adding N entries" window; final fallback: all activation events
            let events = [];
            const hasBuilds = Array.isArray(chat_metadata.stwiiBuilds) && chat_metadata.stwiiBuilds.length;
            if (hasBuilds && Array.isArray(chat_metadata.stwiiBuilds.at(-1)?.added) && chat_metadata.stwiiBuilds.at(-1).added.length) {
                events = chat_metadata.stwiiBuilds.at(-1).added;
            } else {
                const all = Array.isArray(chat_metadata.stwiiActivationEvents) ? chat_metadata.stwiiActivationEvents : [];
                const n = Number(chat_metadata.stwiiLastAddedCount);
                if (Number.isFinite(n) && n > 0 && all.length >= n) {
                    events = all.slice(-n);
                } else {
                    events = all;
                }
            }

            // Hide events from hidden lorebooks for non-admins (same rules as panel)
            const adminBypass = isAdmin();

            // Panel-only per-user visibility for Z- lorebooks.
            // - Exempt "9Z Universal Commands" (visible to everyone)
            // - Z-<handle>-* is visible only to matching user (admins see all)
            // - Other 9Z remain hidden for non-admins
            const norm = (s) => (typeof s === 'string' ? s : '').trim();

            // Extract single handle after "Z-", e.g. "Z-alice-..." => "alice"
            // Allows "Z-alice" (no trailing dash) as well.
            const extractZHandle = (world) => {
                const m = norm(world).match(/^Z-([^-\s]+)(?:-|$)/);
                return m ? m[1] : null;
            };

            // Provided by the host app; fallback to empty if unavailable.
            const currentHandle = (typeof getCurrentUserHandle === 'function' ? getCurrentUserHandle() : '')
                .trim();

            const isHiddenWorld = (w)=> {
                const s = norm(w);
                if (s === '9z universal commands') return false; // exemption

                // Per-user visibility for Z- lorebooks:
                const h = extractZHandle(s);
                if (h) {
                    // Hide if the embedded handle does not match the current user
                    return h !== currentHandle;
                }

                // Keep other 9Z hidden for non-admins
                return s.startsWith('9Z');
            };

            if (!adminBypass) {
                events = events.filter(ev => !isHiddenWorld(ev.world));
            }

            // Build keyword overrides from build logs (diagnostic parsing per loop)
            const lastBuild = (Array.isArray(chat_metadata.stwiiBuilds) && chat_metadata.stwiiBuilds.length) ? chat_metadata.stwiiBuilds.at(-1) : null;
            const logLines = Array.isArray(lastBuild?.logs) ? lastBuild.logs : [];
            const loopRanges = [];
            if (logLines.length) {
                for (let i = 0; i < logLines.length; i++) {
                    const mStart = (logLines[i] || '').match(/\[WI\]\s+---\s+LOOP\s+#(\d+)\s+START\s+---/i);
                    if (mStart) {
                        const n = Number(mStart[1]);
                        let j = i + 1;
                        for (; j < logLines.length; j++) {
                            const mEnd = (logLines[j] || '').match(/\[WI\]\s+---\s+LOOP\s+#(\d+)\s+RESULT\s+---/i);
                            if (mEnd) break;
                        }
                        loopRanges[n - 1] = [i, j];
                    }
                }
            }
            const idsByLoopDiag = Array.isArray(chat_metadata.stwiiLastLoopEntryIds) ? chat_metadata.stwiiLastLoopEntryIds : null;
            const overrideById = new Map();
            if (idsByLoopDiag && idsByLoopDiag.length && loopRanges.length && logLines.length) {
                for (let i = 0; i < idsByLoopDiag.length; i++) {
                    const ids = idsByLoopDiag[i];
                    if (!Array.isArray(ids)) continue;
                    const range = loopRanges[i];
                    const start = Array.isArray(range) ? range[0] : 0;
                    const end = Array.isArray(range) ? range[1] : (logLines.length - 1);
                    for (const id of ids) {
                        const parts = String(id).split(':');
                        const uid = Number(parts.at(-1));
                        const worldName = parts.slice(0, -1).join(':') || null;
                        if (!Number.isFinite(uid)) continue;
                        let idx = -1;
                        for (let k = start; k <= end; k++) {
                            const ln = logLines[k] || '';
                            const matchesUid = ln.includes(`[WI] Entry ${uid} `) && ln.includes('processing');
                            const matchesWorld = worldName ? ln.includes(`from '${worldName}' processing`) : true;
                            if (matchesUid && matchesWorld) { idx = k; break; }
                        }
                        if (idx < 0) continue;
                        // Scan a short window after the processing line to robustly capture primary/logic/secondary
                        let prim = null, logic = null, sec = [];
                        for (let k2 = idx + 1; k2 <= Math.min(end, idx + 6); k2++) {
                            const lnN = logLines[k2] || '';
                            if (!prim) {
                                let m1 = lnN.match(/activated by primary key match\s+(.+)/i);
                                if (m1 && m1[1]) prim = m1[1].trim();
                                if (!prim) {
                                    const m2 = lnN.match(/Entry with primary key match\s+(.+?)\s+has secondary keywords/i);
                                    if (m2 && m2[1]) prim = m2[1].trim();
                                }
                            }
                            if (!logic) {
                                const m3 = lnN.match(/activated\.\s+\((AND ANY|AND ALL|NOT ANY|NOT ALL)\)\s*(?:Found (?:match|not matching) secondary keyword\s+(.+)|No secondary keywords found|All secondary keywords found)/i);
                                if (m3) {
                                    logic = m3[1].replace(/\s+/g, '_');
                                    if (m3[2]) sec.push(m3[2].trim());
                                }
                                // Also catch the "Checking with logic logic (N) ['AND_ANY', 0]" variant
                                const mLogicBracket2 = lnN.match(/Checking with logic\s+logic\s*\(\d+\)\s*\[['"]?(AND_ANY|AND_ALL|NOT_ANY|NOT_ALL)['"]?/i);
                                if (mLogicBracket2 && mLogicBracket2[1] && !logic) {
                                    logic = mLogicBracket2[1];
                                }
                            }
                        }
                        if (prim || sec.length || logic) {
                            overrideById.set(String(id), { primary: prim || null, logic: logic || null, secondary: sec });
                        }
                    }
                }
            }

            // Diagnostic fallback: parse primary/secondary by scanning all logs for the given UID
            function parseFromLogsByUid(lines, uid, world) {
                if (!Array.isArray(lines) || !Number.isFinite(uid)) return null;
                let lastIdx = -1;
                for (let i = 0; i < lines.length; i++) {
                    const t = lines[i] || '';
                    const matchesUid = t.includes(`[WI] Entry ${uid} `) && t.includes('processing');
                    const matchesWorld = world ? t.includes(`from '${world}' processing`) : true;
                    if (matchesUid && matchesWorld) {
                        lastIdx = i;
                    }
                }
                if (lastIdx < 0) return null;
                // Scan a small window after the processing line to extract details even if interleaved
                let prim = null, logic = null, sec = [];
                for (let k = lastIdx + 1; k <= Math.min(lines.length - 1, lastIdx + 6); k++) {
                    const lnN = lines[k] || '';
                    if (!prim) {
                        let m1 = lnN.match(/activated by primary key match\s+(.+)/i);
                        if (m1 && m1[1]) prim = m1[1].trim();
                        if (!prim) {
                            const m2 = lnN.match(/Entry with primary key match\s+(.+?)\s+has secondary keywords/i);
                            if (m2 && m2[1]) prim = m2[1].trim();
                        }
                    }
                    if (!logic) {
                        const m3 = lnN.match(/activated\.\s+\((AND ANY|AND ALL|NOT ANY|NOT ALL)\)\s*(?:Found (?:match|not matching) secondary keyword\s+(.+)|No secondary keywords found|All secondary keywords found)/i);
                        if (m3) {
                            logic = m3[1].replace(/\s+/g, '_');
                            if (m3[2]) sec.push(m3[2].trim());
                        }
                        // Also catch logic-only bracket line
                        const mLogicBracket2 = lnN.match(/Checking with logic\s+logic\s*\(\d+\)\s*\[['"]?(AND_ANY|AND_ALL|NOT_ANY|NOT_ALL)['"]?/i);
                        if (mLogicBracket2 && mLogicBracket2[1] && !logic) {
                            logic = mLogicBracket2[1];
                        }
                    }
                }
                if (prim || sec.length || logic) return { primary: prim || null, logic: logic || null, secondary: sec };
                return null;
            }

            // Build frequency map: keyword -> { count, entries: Set<string> }
            const freq = new Map();
            const sanitizeComment = (s) => typeof s === 'string'
                ? s.replace(/\s*-\s*S[0-9][0-9A-Za-z.\-]*\s*$/, '').trim()
                : '';
            const fmtEntry = (e) => {
                const c = sanitizeComment(e.comment ?? '');
                return `${e.world}:${e.uid}${c ? ` - ${c}` : ''}`;
            };

            // Track entries that had explicit keywords and those that were primary-only
            const entriesWithKeywords = new Set();
            const primaryOnlyEntries = new Set();

            if (events.length) {
                for (const ev of events) {
                    const entryIdent = fmtEntry(ev);
                    const ov = overrideById.get(`${ev.world}:${ev.uid}`) || parseFromLogsByUid(logLines, ev.uid, ev.world) || null;
                    const primaryUse = ov && ov.primary ? ov.primary : (ev.primary || null);
                    const secondaryUse = ov && Array.isArray(ov.secondary) ? ov.secondary : (Array.isArray(ev.secondary) ? ev.secondary : []);
                    const kws = []
                        .concat(primaryUse ? [primaryUse] : [])
                        .concat(secondaryUse);

                    if (kws.length > 0) {
                        entriesWithKeywords.add(entryIdent);
                    } else if (ev.constant !== true) {
                        primaryOnlyEntries.add(entryIdent);
                        // Ensure at least placeholder contributes if somehow missing and not a constant activation
                        kws.push('(no keyword)');
                    }

                    for (const kw of kws) {
                        if (!freq.has(kw)) freq.set(kw, { count: 0, entries: new Set() });
                        const rec = freq.get(kw);
                        rec.count += 1;
                        rec.entries.add(entryIdent);
                    }
                }
            }

            // Remove from "(no keyword)" any entries that also appeared with explicit keywords, and align its count
            if (freq.has('(no keyword)')) {
                const p = freq.get('(no keyword)');
                const filtered = new Set([...p.entries].filter(e => !entriesWithKeywords.has(e)));
                p.entries = filtered;
                p.count = filtered.size;
            }

            const sorted = [...freq.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));

            // Build popup content with classes (no inline styles)
            const container = document.createElement('div');
            container.classList.add('stwii-report-container');

            const title = document.createElement('div');
            title.classList.add('stwii-report-title');
            title.textContent = 'World Info Keyword Report';
            container.append(title);

            const summary = document.createElement('div');
            summary.classList.add('stwii-report-summary');
            const addedCount = events.length;
            summary.textContent = events.length
                ? `Entries added to WI: ${addedCount} • Unique keywords: ${sorted.length}`
                : 'No activation events captured yet.';
            container.append(summary);

            // Loop breakdown (from latest non-dry run)
            // Show counts after applying hidden-book filtering
            const loops = Array.isArray(chat_metadata.stwiiLastLoopCounts) ? chat_metadata.stwiiLastLoopCounts : [];
            if (loops.length > 0) {
                const loopDiv = document.createElement('div');
                loopDiv.classList.add('stwii-report-summary');

                const idsByLoop = Array.isArray(chat_metadata.stwiiLastLoopEntryIds) ? chat_metadata.stwiiLastLoopEntryIds : null;
                const validIds = new Set(events.map(ev => `${ev.world}:${ev.uid}`));

                const pieces = loops.map((n, i) => {
                    let shown = Number.isFinite(n) ? n : 0;

                    if (idsByLoop && Array.isArray(idsByLoop[i])) {
                        // Use precise ID mapping when available, then filter by visible events
                        shown = idsByLoop[i].filter(id => validIds.has(id)).length;
                    } else {
                        // Fallback approximation: slice by original loop sizes but count only visible events in that range
                        const start = loops.slice(0, i).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
                        const end = start + (Number.isFinite(n) ? n : 0);
                        shown = events.slice(start, end).length;
                    }

                    return `Loop ${i + 1}: ${shown} entries`;
                });

                loopDiv.textContent = pieces.join(' • ');
                container.append(loopDiv);
            }


            // Per-loop sections (list entries by loop using last non-dry-run loop counts)
            (function renderLoops() {
                const loops = Array.isArray(chat_metadata.stwiiLastLoopCounts) ? chat_metadata.stwiiLastLoopCounts : [];
                if (!Array.isArray(loops) || loops.length === 0) return;

                const total = loops.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
                if (!Number.isFinite(total) || total <= 0) return;

                let offset = 0;
                for (let i = 0; i < loops.length; i++) {
                    const cnt = Number(loops[i]);
                    if (!Number.isFinite(cnt) || cnt <= 0) continue;

                    const header = document.createElement('div');
                    header.classList.add('stwii-report-subtitle');
                    header.textContent = `Loop ${i + 1}`;
                    container.append(header);

                    let list = [];
                    const idsByLoop = Array.isArray(chat_metadata.stwiiLastLoopEntryIds) ? chat_metadata.stwiiLastLoopEntryIds : null;
                    if (idsByLoop && Array.isArray(idsByLoop[i]) && idsByLoop[i]?.length === cnt) {
                        const byId = new Map(events.map(ev => [`${ev.world}:${ev.uid}`, ev]));
                        list = idsByLoop[i].map(id => byId.get(id)).filter(Boolean);
                    } else {
                        const start = offset;
                        const end = Math.min(events.length, start + (Number.isFinite(cnt) ? cnt : 0));
                        list = start < end ? events.slice(start, end) : [];
                    }

                    const ul = document.createElement('ul');
                    for (const ev of list) {
                        const li = document.createElement('li');
                        li.textContent = fmtEntry(ev);

                        // Highlight constants
                        if (ev && ev.constant === true) {
                            li.style.color = 'var(--SmartThemeEmColor)';
                        }

                        // Append matched keywords inline with operation between primary and secondary
                        // Skip keyword suffix for constant entries
                        if (!(ev && ev.constant === true)) {
                            // Examples:
                            //  - "king AND ANY rainbow"
                            //  - "running NOT ANY circle"
                        const ov2 = overrideById.get(`${ev.world}:${ev.uid}`) || parseFromLogsByUid(logLines, ev.uid, ev.world) || null;
                        const primaryKw = ov2 && ov2.primary ? ov2.primary : (ev && ev.primary ? ev.primary : null);
                        const secRaw = ov2 && Array.isArray(ov2.secondary) ? ov2.secondary.filter(Boolean) : (ev && Array.isArray(ev.secondary) ? ev.secondary.filter(Boolean) : []);
                        const uniqSec = Array.from(new Set(secRaw));
                        const logicMap = {
                            AND_ANY: 'AND ANY',
                            AND_ALL: 'AND ALL',
                            NOT_ANY: 'NOT ANY',
                            NOT_ALL: 'NOT ALL',
                        };
                        const op = ov2 && ov2.logic ? logicMap[ov2.logic] ?? null : (ev && ev.logic ? logicMap[ev.logic] ?? null : null);

                        const prim = primaryKw;
                        // Deduplicate if primary also appears among secondaries (case-insensitive)
                        const uniqSecFiltered = prim ? uniqSec.filter(s => String(s).toLowerCase() !== String(prim).toLowerCase()) : uniqSec;

                        let kwText = '';
                        if (prim && uniqSecFiltered.length) {
                            // Have primary and secondaries; include op if present, otherwise comma-separate
                            if (op) {
                                kwText = ` (${prim} ${op} ${uniqSecFiltered.join(', ')})`;
                            } else {
                                kwText = ` (${prim}, ${uniqSecFiltered.join(', ')})`;
                            }
                        } else if (prim) {
                            // Primary only
                            kwText = ` (${prim})`;
                        } else if (uniqSecFiltered.length) {
                            // Secondary-only; include op if present
                            if (op) {
                                kwText = ` (${op} ${uniqSecFiltered.join(', ')})`;
                            } else {
                                kwText = ` (${uniqSecFiltered.join(', ')})`;
                            }
                        } else {
                            // No captured primary or secondary keywords
                            kwText = ' (no keyword)';
                        }

                            if (kwText) {
                                const span = document.createElement('span');
                                span.style.color = 'var(--SmartThemeQuoteColor)';
                                span.textContent = kwText;
                                li.append(span);
                            }
                        }

                        ul.append(li);
                    }
                    container.append(ul);

                    // paragraph break between loops
                    const spacer = document.createElement('div');
                    spacer.classList.add('stwii-report-summary');
                    spacer.textContent = '';
                    container.append(spacer);

                    offset += cnt;
                }
            })();

            // Use Popup API with allowVerticalScrolling
            const popup = new Popup(container, POPUP_TYPE.TEXT, '', {
                allowVerticalScrolling: true,
                okButton: 'Close',
                wide: true,
                large: true,
                leftAlign: true,
                animation: 'fast',
            });
            await popup.show();
            return 'Opened WI Report popup.';
        },
    }));
};
init();
