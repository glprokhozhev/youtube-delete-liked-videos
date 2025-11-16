// ==UserScript==
// @name         YouTube - Удалить все понравившиеся (с отладкой)
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Удаляет все видео из "Понравившиеся" с отладкой
// @author       You
// @match        https://www.youtube.com/playlist?list=LL*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function deleteAllLikedVideos() {
        console.log('🚀 Скрипт запущен. Ищу элементы...');
        let totalDeleted = 0;
        let previousCount = 0;

        // Добавляем кнопку
        const button = document.createElement('button');
        button.textContent = '❌ УДАЛИТЬ ВСЕ ПОНРАВИВШИЕСЯ (с отладкой)';
        button.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            z-index: 999999;
            background: #ff4444;
            color: white;
            border: none;
            padding: 12px 20px;
            cursor: pointer;
            border-radius: 6px;
            font-weight: bold;
            font-size: 14px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        `;
        button.onclick = async () => {
            button.disabled = true;
            button.textContent = '⏳ Работаю...';
            await deleteVideos();
            button.textContent = '✅ Готово!';
            button.style.backgroundColor = '#4CAF50';
        };
        document.body.appendChild(button);

        async function deleteVideos() {
            while (true) {
                window.scrollTo(0, document.body.scrollHeight);
                console.log('🔄 Прокручиваю страницу...');
                await sleep(4000);

                // Попробуем разные возможные селекторы
                const selectors = [
                    'ytd-playlist-video-renderer #dropdown-trigger button',
                    'ytd-playlist-video-renderer #menu button',
                    'ytd-compact-video-renderer #menu button',
                    'ytd-video-renderer #menu button',
                    'button[aria-label="Действия"]',
                    'button[aria-label="Options"]'
                ];

                let menuButtons = [];
                for (const sel of selectors) {
                    const found = document.querySelectorAll(sel);
                    if (found.length > 0) {
                        console.log(`🔍 Найдено ${found.length} элементов по селектору: ${sel}`);
                        menuButtons = Array.from(found);
                        break;
                    }
                }

                if (menuButtons.length === 0) {
                    console.warn('❌ Никакие кнопки меню не найдены. Проверьте, на правильной ли вы странице.');
                    break;
                }

                if (menuButtons.length === previousCount) {
                    console.log('✅ Все видео загружены. Начинаю удаление...');
                    break;
                }

                previousCount = menuButtons.length;

                for (let i = 0; i < menuButtons.length; i++) {
                    try {
                        const btn = menuButtons[i];
                        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await sleep(600);

                        console.log(`🖱️ Кликаю по кнопке меню ${i + 1}...`);
                        btn.click();
                        await sleep(1000);

                        // Ждём появления меню
                        const menuPopup = document.querySelector('ytd-menu-popup-renderer');
                        if (!menuPopup) {
                            console.warn('❌ Меню не появилось. Пропускаю.');
                            continue;
                        }

                        // Ищем кнопку удаления
                        const menuItems = menuPopup.querySelectorAll('ytd-menu-service-item-renderer');
                        console.log(`📋 Найдено ${menuItems.length} пунктов в меню`);

                        let deleteButton = null;
                        for (const item of menuItems) {
                            const text = item.querySelector('yt-formatted-string');
                            if (text) {
                                const textContent = text.textContent.toLowerCase();
                                console.log(`📝 Пункт меню: "${textContent}"`);
                                if (textContent.includes('удалить') || textContent.includes('remove from') || textContent.includes('unlike')) {
                                    deleteButton = item;
                                    break;
                                }
                            }
                        }

                        if (deleteButton) {
                            console.log('🗑️ Найдена кнопка удаления! Кликаю...');
                            deleteButton.click();
                            await sleep(1500);
                            totalDeleted++;
                            console.log(`✅ Видео ${totalDeleted} удалено`);
                        } else {
                            console.warn('⚠️ Кнопка удаления не найдена');
                        }

                        await sleep(1000);

                    } catch (error) {
                        console.error('❌ Ошибка при обработке видео:', error);
                    }
                }
            }

            console.log(`🎉 ВСЕГО УДАЛЕНО: ${totalDeleted} видео`);
            alert(`✅ Удалено ${totalDeleted} видео из понравившихся!`);
        }
    }

    deleteAllLikedVideos();
})();