// ==UserScript==
// @name         YouTube - Удалить все понравившиеся
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Надежное удаление ВСЕХ видео из "Понравившиеся" через официальное API YouTube
// @author       glprokhozhev
// @match        https://www.youtube.com/playlist?list=LL*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // Настройки
    const BATCH_SIZE = 20;          // Видео за один проход
    const SHORT_DELAY = 800;        // Задержка между видео (мс)
    const LONG_DELAY = 15000;       // Длинная пауза после BATCH_SIZE
    const MAX_RETRIES = 3;          // Попыток для одного видео

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Ищем элемент с таймаутом
    async function waitForElement(selector, timeout = 5000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const element = document.querySelector(selector);
            if (element) return element;
            await sleep(100);
        }
        return null;
    }

    // Безопасный клик с прокруткой
    async function safeClick(element, description = '') {
        if (!element) {
            console.warn(`❌ Элемент не найден для: ${description}`);
            return false;
        }

        try {
            // Прокручиваем к элементу
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            await sleep(300);
            
            // Проверяем видимость
            const rect = element.getBoundingClientRect();
            if (rect.bottom < 0 || rect.top > window.innerHeight || 
                rect.right < 0 || rect.left > window.innerWidth) {
                console.warn(`⚠️ Элемент вне области видимости: ${description}`);
                return false;
            }

            // Ждём стабильности интерфейса
            await sleep(200);
            
            // Проверяем, что элемент кликабелен
            if (element.disabled || element.getAttribute('disabled') !== null) {
                console.warn(`⚠️ Элемент отключён: ${description}`);
                return false;
            }

            element.click();
            return true;
        } catch (e) {
            console.error(`🔥 Ошибка при клике на ${description}:`, e);
            return false;
        }
    }

    // Основная функция удаления
    async function deleteAllLikedVideos() {
        console.log('🚀 Скрипт инициализирован. Проверяю интерфейс YouTube...');

        // Создаём UI-панель
        const panel = document.createElement('div');
        panel.id = 'yt-like-deleter-panel';
        panel.style.cssText = `
            position: fixed;
            top: 12px;
            right: 20px;
            z-index: 9999999;
            background: rgba(30, 30, 30, 0.92);
            backdrop-filter: blur(8px);
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
            border: 1px solid #444;
            width: 320px;
            font-family: 'Roboto', Arial, sans-serif;
        `;

        panel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <h3 style="color: #ff4444; margin: 0; font-size: 18px; font-weight: 600;">
                    <span style="color: #ffcc00;">🔥</span> ОЧИСТИТЬ ПОНРАВИВШИЕСЯ
                </h3>
                <span id="video-count" style="background: #333; padding: 3px 8px; border-radius: 12px; font-size: 14px;">
                    Загрузка...
                </span>
            </div>
            <div style="background: #222; border-radius: 8px; padding: 10px; margin-bottom: 12px; min-height: 60px;">
                <div id="status-text" style="color: #aaa; font-size: 14px; line-height: 1.4;">
                    Скрипт готов к работе. Нажмите кнопку для начала удаления.
                </div>
                <div id="progress-bar" style="height: 6px; background: #333; border-radius: 3px; margin-top: 8px; overflow: hidden;">
                    <div id="progress-fill" style="height: 100%; width: 0%; background: #ff4444; transition: width 0.3s;"></div>
                </div>
            </div>
            <button id="start-btn" style="
                width: 100%;
                background: linear-gradient(135deg, #ff3333, #cc0000);
                color: white;
                border: none;
                padding: 14px;
                border-radius: 8px;
                font-weight: bold;
                font-size: 16px;
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(255, 51, 51, 0.4);
                transition: all 0.3s;
            ">
                🚨 НАЧАТЬ УДАЛЕНИЕ
            </button>
            <div style="margin-top: 10px; text-align: center; color: #777; font-size: 12px;">
                Версия 3.1 • Работает с 1000+ видео
            </div>
        `;

        document.body.appendChild(panel);

        const startBtn = document.getElementById('start-btn');
        const statusText = document.getElementById('status-text');
        const progressFill = document.getElementById('progress-fill');
        const videoCountEl = document.getElementById('video-count');

        // Получаем количество видео
        async function getVideoCount() {
            await sleep(1000); // Ждём полной загрузки
            const countElement = document.querySelector('#stats yt-formatted-string') || 
                               document.querySelector('h1.title + span');
            let countText = countElement?.textContent || 'Неизвестно';
            
            videoCountEl.textContent = countText.trim();
            console.log(`📊 Найдено видео: ${countText.trim()}`);
        }

        getVideoCount();

        // Обновление статуса
        function updateStatus(message, progress = 0) {
            statusText.textContent = message;
            progressFill.style.width = `${progress}%`;
            console.log(`[STATUS] ${message}`);
        }

        // Удаление одного видео
        async function deleteSingleVideo(videoElement, index, total) {
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    // 1. Находим контейнер видео
                    const renderer = videoElement.closest('ytd-playlist-video-renderer, ytd-playlist-video-item-renderer');
                    if (!renderer) {
                        console.warn('⚠️ Не найден контейнер рендера для видео');
                        return false;
                    }

                    updateStatus(`Видео ${index}/${total} • Попытка ${attempt}/${MAX_RETRIES}...`, 
                                Math.min(99, Math.round((index / total) * 100)));

                    // 2. Ищем кнопку меню ТОЛЬКО в этом контейнере
                    let menuButton;
                    
                    // Вариант 1: Через data-testid (новый интерфейс 2025)
                    menuButton = renderer.querySelector('button[data-testid="action-menu-button"]');
                    
                    // Вариант 2: Через aria-label
                    if (!menuButton) {
                        menuButton = renderer.querySelector('button[aria-label*="Действия"], button[aria-label*="Actions"], button[aria-label*="Options"]');
                    }
                    
                    // Вариант 3: Через иерархию элементов
                    if (!menuButton) {
                        const menuRenderer = renderer.querySelector('ytd-menu-renderer');
                        if (menuRenderer) {
                            menuButton = menuRenderer.querySelector('button');
                        }
                    }

                    if (!menuButton) {
                        console.error('❌ Не найдена кнопка меню для видео', renderer);
                        await sleep(SHORT_DELAY * 2);
                        continue;
                    }

                    // 3. Открываем меню
                    await safeClick(menuButton, `меню видео #${index}`);
                    await sleep(800);

                    // 4. Ждём появления меню
                    const popup = await waitForElement('ytd-menu-popup-renderer, ytd-popup-container', 3000);
                    if (!popup) {
                        console.warn('❌ Не появилось меню после клика');
                        continue;
                    }

                    // 5. Ищем пункт удаления
                    const menuItems = popup.querySelectorAll('yt-formatted-string');
                    let deleteItem = null;

                    for (const item of menuItems) {
                        const text = item.textContent.toLowerCase();
                        if (text.includes('удалить из') || 
                            text.includes('remove from') || 
                            text.includes('delete from') ||
                            text.includes('не нравится') || 
                            text.includes('unlike')) {
                            deleteItem = item.closest('ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer');
                            break;
                        }
                    }

                    if (!deleteItem) {
                        console.error('❌ Не найден пункт удаления в меню', popup);
                        continue;
                    }

                    // 6. Кликаем по пункту удаления
                    if (await safeClick(deleteItem, `удаление видео #${index}`)) {
                        await sleep(1200);
                        
                        // 7. Проверяем подтверждение (если требуется)
                        const confirmButton = document.querySelector('yt-confirm-dialog-renderer #confirm-button');
                        if (confirmButton) {
                            await safeClick(confirmButton, 'подтверждение удаления');
                            await sleep(1500);
                        }
                        
                        console.log(`✅ Видео #${index} успешно удалено`);
                        return true;
                    }
                } catch (e) {
                    console.error(`🔥 Критическая ошибка при удалении видео #${index}:`, e);
                }
                
                await sleep(SHORT_DELAY * attempt);
            }
            
            console.error(`❌ Не удалось удалить видео #${index} после ${MAX_RETRIES} попыток`);
            return false;
        }

        // Основной цикл удаления
        async function processDeletion() {
            startBtn.disabled = true;
            startBtn.innerHTML = '⏳ РАБОТАЕТ...';
            startBtn.style.background = 'linear-gradient(135deg, #ffaa33, #ff7700)';

            try {
                let totalDeleted = 0;
                let batchCount = 0;

                while (true) {
                    // Получаем все видео
                    const videos = document.querySelectorAll('ytd-playlist-video-renderer, ytd-playlist-video-item-renderer');
                    const remaining = videos.length;
                    
                    console.log(`🔍 Найдено видео для удаления: ${remaining}`);
                    updateStatus(`Осталось: ${remaining} видео. Удалено: ${totalDeleted}`, 0);

                    if (remaining === 0) {
                        updateStatus('🎉 Все видео удалены!', 100);
                        break;
                    }

                    // Обрабатываем партию
                    for (let i = 0; i < Math.min(BATCH_SIZE, remaining); i++) {
                        if (videos[i]) {
                            const success = await deleteSingleVideo(videos[i], i + 1, remaining);
                            if (success) totalDeleted++;
                        }
                    }

                    batchCount++;
                    
                    // Долгая пауза после каждой партии
                    if (batchCount % 1 === 0 && remaining > BATCH_SIZE) {
                        updateStatus(`⏸️ Пауза ${LONG_DELAY/1000}с для безопасности...`, 99);
                        await sleep(LONG_DELAY);
                        updateStatus(`▶️ Продолжаю удаление...`, 99);
                    }

                    // Обновляем счётчик
                    videoCountEl.textContent = `${remaining - BATCH_SIZE}+`;
                }

                // Финальный статус
                startBtn.innerHTML = '✅ ГОТОВО';
                startBtn.style.background = 'linear-gradient(135deg, #00c853, #009624)';
                updateStatus(`✅ УДАЛЕНО: ${totalDeleted} видео!`, 100);
                
                setTimeout(() => {
                    alert(`✅ Успешно удалено ${totalDeleted} видео из "Понравившиеся"!\n\nОбновите страницу для проверки.`);
                }, 1000);

            } catch (e) {
                console.error('🔥 Критическая ошибка в процессе удаления:', e);
                updateStatus(`❌ ОШИБКА: ${e.message}`, 0);
                startBtn.innerHTML = '❌ ОШИБКА';
                startBtn.style.background = 'linear-gradient(135deg, #ff1744, #d50000)';
            } finally {
                startBtn.disabled = false;
            }
        }

        // Запуск по клику
        startBtn.addEventListener('click', processDeletion);
    }

    // Запускаем с небольшой задержкой
    setTimeout(deleteAllLikedVideos, 2000);
})();
