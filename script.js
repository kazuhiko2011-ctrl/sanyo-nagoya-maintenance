$(document).ready(function() {
    let checklistData = [];
    let currentPhase = 1;
    let totalPhases = 0;
    let userSelections = {};

    // Get CSV file name from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const csvFile = urlParams.get('file');

    if (!csvFile) {
        $('#checklist-container').html('<div class="alert alert-danger">エラー: チェックリストファイルが指定されていません。メインメニューから選択し直してください。</div>');
        $('.mt-3 button').hide();
        return;
    }

    // Load state from sessionStorage, scoped by checklist file
    const selectionKey = `userSelections_${csvFile}`;
    const phaseKey = `currentPhase_${csvFile}`;

    if (sessionStorage.getItem(selectionKey)) {
        userSelections = JSON.parse(sessionStorage.getItem(selectionKey));
    }
    if (sessionStorage.getItem(phaseKey)) {
        currentPhase = parseInt(sessionStorage.getItem(phaseKey));
    }

    function loadChecklist() {
        Papa.parse('./' + csvFile, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                if (results.data && results.data.length > 0) {
                    checklistData = results.data;
                    // Set title
                    const firstTitle = checklistData[0].phase_title.split(':')[0].replace('Phase 1', '').trim();
                     document.title = $('<h1>').text(firstTitle  || 'チェックリスト').parent().html();
                    totalPhases = Math.max(...checklistData.map(item => parseInt(item.phase)));
                    renderPhase(currentPhase);
                } else {
                     $('#checklist-container').html(`<div class="alert alert-danger">エラー: <strong>${csvFile}</strong> の読み込みに失敗したか、ファイルが空です。</div>`);
                     $('.mt-3 button').not('#exit-btn').hide();
                }
            },
            error: function(err, file) {
                 $('#checklist-container').html(`<div class="alert alert-danger">エラー: <strong>${csvFile}</strong> が見つかりません。ファイル名を確認してください。</div>`);
                 $('.mt-3 button').not('#exit-btn').hide();
            }
        });
    }

    function renderPhase(phase) {
        const phaseData = checklistData.filter(item => parseInt(item.phase) === phase);
        if (phaseData.length === 0) return;

        let container = $('#checklist-container');
        container.empty();

        const phaseTitle = phaseData[0].phase_title;
        container.append(`<h2 class="phase-title">${phaseTitle}</h2>`);
        document.title = phaseTitle;


        // Special display logic for linked phases
        if (phaseData[0].linked_to_phase2 === 'TRUE') {
            const linkedPhaseNumber = phase === 3 ? 2 : (phase === 5 ? 4 : -1);
            const ngItems = Object.keys(userSelections)
                .filter(key => key.startsWith(`phase${linkedPhaseNumber}_`) && userSelections[key] === 'NG')
                .map(key => key.replace(`phase${linkedPhaseNumber}_`, ''));

            const itemsToShow = phaseData.filter(item => ngItems.includes(item.linked_item));

            if (itemsToShow.length === 0) {
                container.append('<p>前のフェーズで「NG」とされた項目はありません。次へ進んでください。</p>');
            } else {
                 renderItems(itemsToShow, phase);
            }
        } else {
            renderItems(phaseData, phase);
        }
        
        updateNavigation();
        updateNextButtonState();
    }
    
    function renderItems(items, phase) {
        let container = $('#checklist-container');
        const groupedByCategory = items.reduce((acc, item) => {
            (acc[item.category] = acc[item.category] || []).push(item);
            return acc;
        }, {});

        for (const category in groupedByCategory) {
            container.append(`<h4 class="category-title">${category}</h4>`);
            const itemsInCategory = groupedByCategory[category];
            itemsInCategory.forEach(item => {
                const itemKey = `phase${phase}_${item.item}`;
                const savedValue = userSelections[itemKey];

                let inputs = '';
                if (item.type === 'checklist') {
                    const isChecked = savedValue === 'checked';
                    inputs = `<input type="checkbox" class="form-check-input" data-item-key="${itemKey}" ${isChecked ? 'checked' : ''}>`;
                } else if (item.type === 'checklist_with_status') {
                     const isDone = savedValue === '実施済み';
                     const isNA = savedValue === '非該当';
                     const isOK = savedValue === 'OK';
                     const isNG = savedValue === 'NG';

                     if (phase === 2 || phase === 4) { // Phase 2-1, 2-2
                         inputs = `
                             <div class="btn-group btn-group-toggle" data-toggle="buttons">
                                 <label class="btn btn-outline-success ${isOK ? 'active' : ''}">
                                     <input type="radio" name="${itemKey}" value="OK" ${isOK ? 'checked' : ''}> OK
                                 </label>
                                 <label class="btn btn-outline-danger ${isNG ? 'active' : ''}">
                                     <input type="radio" name="${itemKey}" value="NG" ${isNG ? 'checked' : ''}> NG
                                 </label>
                             </div>`;
                     } else { // Phase 3, 4, 5, 6, 7
                         inputs = `
                             <div class="btn-group btn-group-toggle" data-toggle="buttons">
                                 <label class="btn btn-outline-primary ${isDone ? 'active' : ''}">
                                     <input type="radio" name="${itemKey}" value="実施済み" ${isDone ? 'checked' : ''}> 実施済み
                                 </label>
                                 <label class="btn btn-outline-secondary ${isNA ? 'active' : ''}">
                                     <input type="radio" name="${itemKey}" value="非該当" ${isNA ? 'checked' : ''}> 非該当
                                 </label>
                             </div>`;
                     }
                }

                container.append(
                    `<div class="checklist-item-row">
                        <label class="item-label">${item.item}</label>
                        <div>${inputs}</div>
                    </div>`
                );
            });
        }
    }


    function updateNavigation() {
        $('#prev-btn').toggle(currentPhase > 1);
        $('#next-btn').toggle(currentPhase < totalPhases);
        $('#excel-export-btn').toggle(currentPhase === 3); // Show only on Phase 3-1
    }

    function updateNextButtonState() {
        let enabled = false;
        const phaseData = checklistData.filter(item => parseInt(item.phase) === currentPhase);
        if(phaseData.length === 0) { // For linked phases with no items
            enabled = true;
            $('#next-btn').prop('disabled', !enabled);
            return;
        }

        if (currentPhase === 1) {
            const emergencyItems = phaseData.filter(i => i.category === '緊急停止措置');
            const detectionItems = phaseData.filter(i => i.category === '異常検知');
            const emergencyAllChecked = emergencyItems.every(item => userSelections[`phase1_${item.item}`] === 'checked');
            const detectionOneChecked = detectionItems.some(item => userSelections[`phase1_${item.item}`] === 'checked');
            enabled = emergencyAllChecked && detectionOneChecked;
        } else if (currentPhase === 2 || currentPhase === 4) { // Phase 2-1 & 2-2
            enabled = phaseData.every(item => userSelections[`phase${currentPhase}_${item.item}`]);
        } else if (currentPhase === 3 || currentPhase === 5) { // Phase 3-1 & 3-2
            const linkedPhaseNumber = currentPhase === 3 ? 2 : 4;
            const ngItems = Object.keys(userSelections)
                .filter(key => key.startsWith(`phase${linkedPhaseNumber}_`) && userSelections[key] === 'NG')
                .map(key => key.replace(`phase${linkedPhaseNumber}_`, ''));
            const itemsToShow = phaseData.filter(item => ngItems.includes(item.linked_item));
            if (itemsToShow.length === 0) {
                enabled = true;
            } else {
                enabled = itemsToShow.every(item => userSelections[`phase${currentPhase}_${item.item}`]);
            }
        } else if (currentPhase === 6) { // Phase 4 in spec, now 6
             enabled = phaseData.every(item => userSelections[`phase${currentPhase}_${item.item}`]);
        } else if (currentPhase === 7) { // Phase 5 in spec, now 7
            enabled = phaseData.some(item => userSelections[`phase${currentPhase}_${item.item}`] === '実施済み');
        }

        $('#next-btn').prop('disabled', !enabled);
    }

    // Event Handlers
    $('#checklist-container').on('change', 'input', function() {
        const key = $(this).data('item-key') || $(this).attr('name');
        let value;
        if ($(this).is(':checkbox')) {
            value = $(this).is(':checked') ? 'checked' : 'unchecked';
        } else if ($(this).is(':radio')) {
            value = $(this).val();
        }
        userSelections[key] = value;
        sessionStorage.setItem(selectionKey, JSON.stringify(userSelections));
        updateNextButtonState();
    });

    $('#next-btn').click(function() {
        if (currentPhase < totalPhases) {
            currentPhase++;
            sessionStorage.setItem(phaseKey, currentPhase);
            renderPhase(currentPhase);
        }
    });

    $('#prev-btn').click(function() {
        if (currentPhase > 1) {
            currentPhase--;
            sessionStorage.setItem(phaseKey, currentPhase);
            renderPhase(currentPhase);
        }
    });

    $('#exit-btn').click(function() {
        if (confirm('チェックリストを終了しますか？\n(入力内容は保存されます)')) {
            window.location.href = 'index.html';
        }
    });
    
    $('#excel-export-btn').click(function() {
        let exportData = [];
        const phasesToExport = [1, 2, 3];
        
        phasesToExport.forEach(phaseNum => {
            const phaseData = checklistData.filter(item => parseInt(item.phase) === phaseNum);
            phaseData.forEach(item => {
                const itemKey = `phase${phaseNum}_${item.item}`;
                const selection = userSelections[itemKey] || '';
                
                let status = selection;
                if(phaseNum === 1) status = (selection === 'checked') ? '該当' : '非該当';
                if(phaseNum === 2) status = selection; // OK or NG
                if(phaseNum === 3) status = selection; // 実施済み or 非該当

                // Only add if it was relevant
                if(status){
                     exportData.push({
                        'フェーズ': item.phase_title,
                        '分類': item.category,
                        'チェック項目': item.item,
                        'ステータス': status
                    });
                }
            });
        });

        const csv = Papa.unparse(exportData);
        const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "工事表データ.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // --- ここから追加 ---
    // Print Button Handler
    $(document).on('click', '#print-btn', function() {
        // 1. Get the checklist title from the first item in the data
        const checklistTitle = checklistData.length > 0 ? checklistData[0].phase_title.split(':')[0].replace('Phase 1', '').trim() : "チェックリスト報告書";

        // 2. Build the summary HTML string
        let summaryHtml = `
            <div style="padding: 30px; font-family: 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif;">
                <h1 style="font-size: 24px; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px;">${checklistTitle} - 実施報告書</h1>
                <p style="font-size: 16px;"><strong>実施日:</strong> ${new Date().toLocaleDateString()}</p>
                <hr style="margin: 30px 0;">
        `;

        // --- Phase 1: 異常検知・緊急停止の状況 ---
        summaryHtml += '<h2 style="font-size: 20px; color: #444; margin-top: 30px;">Phase 1: 異常検知・緊急停止の状況</h2>';
        const phase1_detection = checklistData.filter(item => parseInt(item.phase) === 1 && item.category === '異常検知');
        const phase1_stop = checklistData.filter(item => parseInt(item.phase) === 1 && item.category === '緊急停止措置');
        
        summaryHtml += '<h3 style="font-size: 18px; border-left: 5px solid #007bff; padding-left: 10px; margin-top: 20px;">異常検知</h3><ul style="list-style-type: disc; padding-left: 20px;">';
        let detectionChecked = false;
        phase1_detection.forEach(item => {
            const key = `phase1_${item.item}`;
            if (userSelections[key] === 'checked') {
                summaryHtml += `<li style="font-size: 16px; margin-bottom: 8px;">${item.item}</li>`;
                detectionChecked = true;
            }
        });
        if (!detectionChecked) summaryHtml += '<li style="font-size: 16px; margin-bottom: 8px;">検知された異常はありません。</li>';
        summaryHtml += '</ul>';

        summaryHtml += '<h3 style="font-size: 18px; border-left: 5px solid #007bff; padding-left: 10px; margin-top: 20px;">緊急停止措置</h3><ul style="list-style-type: none; padding-left: 0;">';
        phase1_stop.forEach(item => {
            const key = `phase1_${item.item}`;
            const status = userSelections[key] === 'checked' ? '実施' : '未実施';
            summaryHtml += `<li style="font-size: 16px; margin-bottom: 8px;">${item.item}: <strong style="color: ${status === '実施' ? '#28a745' : '#dc3545'};">${status}</strong></li>`;
        });
        summaryHtml += '</ul>';
        summaryHtml += '<hr style="margin: 30px 0;">';

        // --- Phase 2-1: 故障原因調査（使用部門）の結果 ---
        summaryHtml += '<h2 style="font-size: 20px; color: #444; margin-top: 30px;">Phase 2-1: 故障原因調査（使用部門）の結果</h2><ul style="list-style-type: none; padding-left: 0;">';
        const phase2Data = checklistData.filter(item => parseInt(item.phase) === 2 && item.linked_to_phase2 !== 'TRUE'); // Filter for actual phase 2 items
        let causeInvestigated = false;
        phase2Data.forEach(item => {
            const key = `phase2_${item.item}`;
            if (userSelections[key]) {
                const statusColor = userSelections[key] === 'OK' ? '#28a745' : '#dc3545';
                summaryHtml += `<li style="font-size: 16px; margin-bottom: 8px;">${item.item}: <strong style="color: ${statusColor};">${userSelections[key]}</strong></li>`;
                causeInvestigated = true;
            }
        });
        if (!causeInvestigated) summaryHtml += '<li style="font-size: 16px; margin-bottom: 8px;">故障原因調査の該当項目はありませんでした。</li>';
        summaryHtml += '</ul><hr style="margin: 30px 0;">';

        // --- Phase 3-1: 対策実施（使用部門）の結果 ---
        summaryHtml += '<h2 style="font-size: 20px; color: #444; margin-top: 30px;">Phase 3-1: 対策実施（使用部門）の結果</h2><ul style="list-style-type: none; padding-left: 0;">';
        const phase3Data = checklistData.filter(item => parseInt(item.phase) === 3 && item.linked_to_phase2 === 'TRUE'); // Filter for linked items in phase 3
        let measuresTaken = false;
        phase3Data.forEach(item => {
            const key = `phase3_${item.item}`;
            if (userSelections[key]) {
                 const statusColor = userSelections[key] === '実施済み' ? '#007bff' : '#6c757d';
                summaryHtml += `<li style="font-size: 16px; margin-bottom: 8px;">${item.item}: <strong style="color: ${statusColor};">${userSelections[key]}</strong></li>`;
                measuresTaken = true;
            }
        });
        if (!measuresTaken) summaryHtml += '<li style="font-size: 16px; margin-bottom: 8px;">実施した対策はありませんでした。</li>';
        summaryHtml += '</ul>';

        summaryHtml += '</div>'; // Close the main div

        // 3. Set the generated HTML to the printable area and call the print function
        $('#printable-area').html(summaryHtml);
        window.print();
    });
    // --- 追加ここまで ---

    // Initial load
    loadChecklist();
});
