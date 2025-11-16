// ==UserScript==
// @name         YouTube - Удалить все понравившиеся (с отладкой)
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  Удаляет все видео из "Понравившиеся" с отладкой (исправлена ошибка с 100 видео)
// @author       glprokhozhev
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
        let batchCount = 1;

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
                console.log(`📦 Обрабатываю порцию #${batchCount}`);

                // Принудительно прокручиваем вниз для подгрузки всех видео
                for (let i = 0; i < 5; i++) {
                    window.scrollTo(0, document.body.scrollHeight);
                    console.log(`🔽 Прокрутка ${i + 1}/5 для подгрузки...`);
                    await sleep(1500);
                }

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
                    const found = Array.from(document.querySelectorAll(sel)).filter(btn => {
                        // Фильтруем уже обработанные кнопки
                        return !btn.hasAttribute('data-processed');
                    });

                    if (found.length > 0) {
                        console.log(`🔍 Найдено ${found.length} новых элементов по селектору: ${sel}`);
                        menuButtons = found;
                        break;
                    }
                }

                // Если кнопок нет - проверяем, остались ли вообще видео
                if (menuButtons.length === 0) {
                    // Дополнительная проверка на наличие видео
                    const videoItems = document.querySelectorAll('ytd-playlist-video-renderer, ytd-compact-video-renderer');
                    if (videoItems.length === 0) {
                        console.log('✅ Все видео удалены!');
                        break;
                    }

                    console.log('⚠️ Кнопки не найдены, но есть видео. Пробуем перезагрузить страницу через 5 сек...');
                    await sleep(5000);
                    continue;
                }

                console.log(`✅ Найдено видео для удаления в порции ${batchCount}: ${menuButtons.length}`);

                let deletedInBatch = 0;
                for (let i = 0; i < menuButtons.length; i++) {
                    const btn = menuButtons[i];

                    try {
                        // Помечаем кнопку как обработанную
                        btn.setAttribute('data-processed', 'true');

                        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await sleep(600);

                        console.log(`🖱️ Обрабатываю видео ${i + 1} из ${menuButtons.length} в порции ${batchCount}...`);
                        btn.click();
                        await sleep(1200);

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
                                if (textContent.includes('удалить') ||
                                    textContent.includes('remove from') ||
                                    textContent.includes('unlike') ||
                                    textContent.includes('не нравится')) {
                                    deleteButton = item;
                                    break;
                                }
                            }
                        }

                        if (deleteButton) {
                            console.log('🗑️ Найдена кнопка удаления! Кликаю...');
                            deleteButton.click();
                            await sleep(1800); // Увеличено время ожидания для надежности
                            deletedInBatch++;
                            totalDeleted++;
                            console.log(`✅ Удалено: ${totalDeleted} (в этой порции: ${deletedInBatch})`);
                        } else {
                            console.warn('⚠️ Кнопка удаления не найдена');
                        }

                    } catch (error) {
                        console.error('❌ Ошибка при обработке видео:', error);
                    } finally {
                        // Закрываем меню если осталось открытым
                        const closeBtn = document.querySelector('tp-yt-paper-dialog #close-button');
                        if (closeBtn) closeBtn.click();
                        await sleep(800);
                    }
                }

                console.log(`🏁 Порция ${batchCount} завершена: удалено ${deletedInBatch} видео`);
                batchCount++;

                // Если в порции не удалили ни одного видео - выходим
                if (deletedInBatch === 0) {
                    console.log('⚠️ Не удалось удалить видео в этой порции. Завершаю работу.');
                    break;
                }

                // Прокручиваем вверх для сброса позиции
                window.scrollTo(0, 0);
                console.log('🔼 Прокручиваю вверх для обновления списка...');
                await sleep(3000);
            }

            console.log(`🎉 ВСЕГО УДАЛЕНО: ${totalDeleted} видео`);
            alert(`✅ Удалено ${totalDeleted} видео из понравившихся!`);
        }
    }

    deleteAllLikedVideos();
})();
