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
    function supportsAnchors() {
        return CSS.supports?.('position-anchor: --x') && CSS.supports?.('anchor-name: --x');
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
        panelEl.style.position = 'fixed';

        const tr = triggerEl.getBoundingClientRect();
        const pw = panelEl.offsetWidth || 300;
        const ph = panelEl.offsetHeight || 200;

        // Prefer right side, flip to left if overflowing
        let left = tr.right + gap;
        if (left + pw > window.innerWidth - 4) {
            left = tr.left - pw - gap;
        }
        left = clamp(left, 4, Math.max(4, window.innerWidth - pw - 4));

        // Align top with trigger, clamp vertically
        let top = clamp(tr.top, 4, Math.max(4, window.innerHeight - ph - 4));

        // Apply placement
        panelEl.style.left = left + 'px';
        panelEl.style.top = top + 'px';
        panelEl.style.right = 'auto';
        panelEl.style.bottom = 'auto';

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

        if (panel.classList.contains('stwii--isActive')) {
            placePanelNearTrigger(panel, trigger);
        }
        if (configPanel.classList.contains('stwii--isActive')) {
            placePanelNearTrigger(configPanel, trigger);
        }
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
        const norm = (s) => (typeof s === 'string' ? s : '').trim().toLowerCase();

        // Extract single handle after "Z-", e.g. "Z-alice-..." => "alice"
        // Allows "Z-alice" (no trailing dash) as well.
        const extractZHandle = (world) => {
            const m = norm(world).match(/^z-([^-\s]+)(?:-|$)/);
            return m ? m[1] : null;
        };

        // Provided by the host app; fallback to empty if unavailable.
        const currentHandle = (typeof getCurrentUserHandle === 'function' ? getCurrentUserHandle() : '')
            .trim()
            .toLowerCase();

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
            return s.startsWith('9z');
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

    // WI activation log capture (no changes to world-info.js)
    const activationDrafts = new Map();
    function parseWiUIDFromFirstArg(a0) {
        if (typeof a0 !== 'string') return null;
        const m = a0.match(/\[WI\]\s+Entry\s+(\d+)/);
        return m ? Number(m[1]) : null;
    }
    function ensureEventArray() {
        if (!Array.isArray(chat_metadata.stwiiActivationEvents)) chat_metadata.stwiiActivationEvents = [];
    }
    function upsertDraft(uid) {
        if (!activationDrafts.has(uid)) {
            activationDrafts.set(uid, { primary: null, secondary: [], secondaryNon: [], logic: null });
        }
        return activationDrafts.get(uid);
    }
    function handleWiDebugArgs(args) {
        if (!args || args.length === 0) return;
        const a0 = args[0];
        const uid = parseWiUIDFromFirstArg(a0);
        if (uid == null) return;

        const a1 = args[1];
        const a2 = args[2];

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

        // Final activation commit
        if (typeof a0 === 'string' && a0.includes('activation successful, adding to prompt')) {
            const entryObj = args[1];
            if (!entryObj || typeof entryObj !== 'object') return;
            const d = activationDrafts.get(uid) || { primary: null, secondary: [], secondaryNon: [], logic: null };

            ensureEventArray();
            // Fallback: if AND_ALL but no captured secondaries, include all entry secondaries
            const sec = (d.logic === 'AND_ALL' && (!d.secondary || d.secondary.length === 0) && Array.isArray(entryObj.keysecondary))
                ? [...entryObj.keysecondary]
                : (d.secondary || []);

            chat_metadata.stwiiActivationEvents.push({
                ts: Date.now(),
                world: entryObj.world,
                uid: entryObj.uid,
                comment: entryObj.comment ?? '',
                primary: d.primary,
                secondary: sec,
                logic: d.logic,
            });

            activationDrafts.delete(uid);
            return;
        }
    }

    //! HACK: no event when no entries are activated, only a debug message
    const original_debug = console.debug;
    console.debug = function(...args) {
        // capture WI activation details
        try { handleWiDebugArgs(args); } catch {}
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

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'wi-triggered',
        callback: (args, value)=>{
            return JSON.stringify(currentEntryList);
        },
        returns: 'list of triggered WI entries',
        helpString: 'Get the list of World Info entries triggered on the last generation.',
    }));

    // Generate a keyword frequency report from captured activation events (popup with declared options, no inline styles)
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'wi-report',
        returns: 'opens popup',
        helpString: 'Show keywords that triggered WI entries (most frequent first) in a scrollable popup. Usage: /wi-report',
        callback: async () => {
            const events = Array.isArray(chat_metadata.stwiiActivationEvents) ? chat_metadata.stwiiActivationEvents : [];

            // Build frequency map: keyword -> { count, entries: Set<string> }
            const freq = new Map();
            const fmtEntry = (e) => `${e.world}:${e.uid}${e.comment ? ` - ${e.comment}` : ''}`;

            if (events.length) {
                for (const ev of events) {
                    const entryIdent = fmtEntry(ev);
                    const kws = []
                        .concat(ev.primary ? [ev.primary] : [])
                        .concat(Array.isArray(ev.secondary) ? ev.secondary : []);

                    if (!kws.length) {
                        // Ensure at least primary placeholder contributes if somehow missing
                        kws.push('(primary)');
                    }

                    for (const kw of kws) {
                        if (!freq.has(kw)) freq.set(kw, { count: 0, entries: new Set() });
                        const rec = freq.get(kw);
                        rec.count += 1;
                        rec.entries.add(entryIdent);
                    }
                }
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
            summary.textContent = events.length
                ? `Events: ${events.length} • Unique keywords: ${sorted.length}`
                : 'No activation events captured yet.';
            container.append(summary);

            const pre = document.createElement('pre');
            pre.classList.add('stwii-report-pre');
            pre.textContent = (() => {
                if (!events.length) return 'No data available.';
                const lines = [];
                for (const [kw, info] of sorted) {
                    const entryList = [...info.entries].join('; ');
                    lines.push(`- ${kw}: ${info.count} -> ${entryList}`);
                }
                return lines.join('\n');
            })();
            container.append(pre);

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
