/**
 * StateSerializer - Модуль для сериализации состояния приложения в URL и обратно.
 * Использует JSON + Base64 кодирование для компактного представления в URL.
 */

const StateSerializer = (() => {
    const URL_PARAM_NAME = 'dsk_state';

    /**
     * Извлекает состояние из текущей строки запроса URL
     * @returns {Object|null} Объект состояния или null, если параметра нет
     */
    function loadFromURL() {
        const params = new URLSearchParams(window.location.search);
        const stateStr = params.get(URL_PARAM_NAME);

        if (!stateStr) return null;

        try {
            // Декодируем из Base64 URL-safe формата
            const jsonStr = atob(stateStr.replace(/-/g, '+').replace(/_/g, '/'));
            const state = JSON.parse(jsonStr);
            
            // Валидация базовой структуры
            if (state && typeof state === 'object') {
                console.log('[StateSerializer] State loaded from URL');
                return state;
            }
        } catch (e) {
            console.warn('[StateSerializer] Failed to parse URL state:', e);
            // Очищаем битый параметр из URL
            cleanURL();
        }
        return null;
    }

    /**
     * Сохраняет текущее состояние приложения в URL
     * @param {Object} appState - Текущее состояние из readParams()
     */
    function saveToURL(appState) {
        try {
            // Фильтруем только нужные ключи для URL
            const filteredState = {
                W: appState.W,
                H: appState.H,
                thickness: appState.thickness,
                rTop: appState.rTop,
                rBottom: appState.rBottom,
                rNotch: appState.rNotch,
                notchOn: appState.notchOn,
                notchH: appState.notchH,
                notchBottom: appState.notchBottom,
                notchTop: appState.notchTop,
                underframeType: appState.underframeType,
                underframeInsetH: appState.underframeInsetH,
                underframeInsetV: appState.underframeInsetV,
                dimensionsOn: appState.dimensionsOn,
                // Сериализуем элементы через их менеджеры
                instances: {}
            };
            
            // Добавляем данные элементов из менеджеров
            if (window.UI && window.UI.ELEMENT_MANAGERS) {
                window.UI.ELEMENT_MANAGERS.forEach(({ key, mgr }) => {
                    filteredState.instances[key] = mgr.items;
                });
            }

            const jsonStr = JSON.stringify(filteredState);
            
            // Проверяем длину URL - браузеры имеют ограничения (~2000 символов для IE, ~8000+ для современных)
            const base64Str = btoa(jsonStr).replace(/\+/g, '-').replace(/\//g, '_');
            const potentialUrlLength = window.location.pathname.length + URL_PARAM_NAME.length + base64Str.length + 5;
            
            if (potentialUrlLength > 6000) {
                console.warn('[StateSerializer] URL may be too long (' + potentialUrlLength + ' chars). Consider saving as file instead.');
            }

            const newUrl = `${window.location.pathname}?${URL_PARAM_NAME}=${base64Str}`;
            
            // Используем replaceState, чтобы не добавлять запись в историю браузера при каждом изменении
            window.history.replaceState({}, '', newUrl);
        } catch (e) {
            console.warn('[StateSerializer] Failed to save state to URL:', e);
            alert('Не удалось сохранить состояние в URL. Возможно, проект слишком большой. Используйте "Сохранить" для экспорта в файл.');
        }
    }

    /**
     * Очищает параметр состояния из URL
     */
    function cleanURL() {
        const url = new URL(window.location);
        url.searchParams.delete(URL_PARAM_NAME);
        window.history.replaceState({}, '', url);
    }

    /**
     * Применяет загруженное состояние к UI
     * @param {Object} savedState - Состояние из loadFromURL()
     */
    function applyStateToUI(savedState, uiHelpers) {
        if (!savedState || !uiHelpers.el) return;
        
        const el = uiHelpers.el;
        const inputs = uiHelpers.inputs;
        
        // Применяем основные параметры
        if (savedState.W !== undefined && inputs.rectW) inputs.rectW.value = savedState.W;
        if (savedState.H !== undefined && inputs.rectH) inputs.rectH.value = savedState.H;
        if (savedState.thickness !== undefined && inputs.rectThickness) inputs.rectThickness.value = savedState.thickness;
        if (savedState.rTop !== undefined && inputs.rTop) inputs.rTop.value = savedState.rTop;
        if (savedState.rBottom !== undefined && inputs.rBottom) inputs.rBottom.value = savedState.rBottom;
        if (savedState.rNotch !== undefined && inputs.rNotch) inputs.rNotch.value = savedState.rNotch;
        if (savedState.notchOn !== undefined && inputs.notchOn) inputs.notchOn.checked = savedState.notchOn;
        if (savedState.notchH !== undefined && inputs.notchH) inputs.notchH.value = savedState.notchH;
        if (savedState.notchBottom !== undefined && inputs.notchBottom) inputs.notchBottom.value = savedState.notchBottom;
        if (savedState.notchTop !== undefined && inputs.notchTop) inputs.notchTop.value = savedState.notchTop;
        if (savedState.underframeType !== undefined && inputs.underframeType) inputs.underframeType.value = savedState.underframeType;
        if (savedState.underframeInsetH !== undefined && inputs.underframeInsetH) inputs.underframeInsetH.value = savedState.underframeInsetH;
        if (savedState.underframeInsetV !== undefined && inputs.underframeInsetV) inputs.underframeInsetV.value = savedState.underframeInsetV;
        if (savedState.dimensionsOn !== undefined && inputs.dimensionsOn) inputs.dimensionsOn.checked = savedState.dimensionsOn;
        
        // Применяем элементы
        if (savedState.instances && window.UI && window.UI.ELEMENT_MANAGERS) {
            Object.keys(savedState.instances).forEach(key => {
                const mgrData = window.UI.ELEMENT_MANAGERS.find(m => m.key === key);
                if (mgrData && savedState.instances[key]) {
                    mgrData.mgr.setItems(savedState.instances[key]);
                }
            });
        }
    }

    return {
        loadFromURL,
        saveToURL,
        cleanURL,
        applyStateToUI
    };
})();
