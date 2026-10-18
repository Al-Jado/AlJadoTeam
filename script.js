    // ============================================================================
    // ☁️ إعدادات FIREBASE الثابتة (ضع رابط قاعدة البيانات هنا ليعمل على كل الأجهزة تلقائياً)
    // ============================================================================
    const DEFAULT_FIREBASE_CONFIG = {
        // بعد إنشاء قاعدة البيانات في Firebase، ضع الرابط هنا بين علامتي التنصيص:
        // مثال: databaseURL: "https://al-jado-team-default-rtdb.firebaseio.com"
        databaseURL: "https://al-jado-default-rtdb.firebaseio.com"
    };

    let currentAlarmExcess = 0;
    let memory = JSON.parse(localStorage.getItem('alJadoDatabase')) || [];
    let agentProfitStatus = JSON.parse(localStorage.getItem('agentProfitStatus')) || {};
    let siteCharges = JSON.parse(localStorage.getItem('alJadoSiteCharges')) || [];
    let companyPayments = JSON.parse(localStorage.getItem('alJadoCompanyPayments')) || [];
    let currentDisplayedOps = [];

    // متغيرات اتصال Firebase
    let firebaseDbRef = null;
    let isApplyingCloudUpdate = false;

    document.addEventListener("DOMContentLoaded", () => {
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = today.substring(0, 7);

        document.getElementById('docDate').value = today;
        document.getElementById('monthSelector').value = currentMonth;
        document.getElementById('filterFromDate').value = currentMonth + "-01";
        document.getElementById('filterToDate').value = today;

        loadArchive();
        buildDropdown();
        renderAgentsControl();
        updateTreasury();
        runRangeFilter();

        // بدء الاتصال بالسحابة إن وجدت الإعدادات
        initFirebaseSync();
    });

    function formatNum(num) { return Number(num).toLocaleString('en-US'); }

    // ============================================================================
    // ☁️ منظومة المزامنة السحابية المحمية بكلمة سر (Firebase Realtime Database)
    // ============================================================================
    function getActiveFirebaseConfig() {
        try {
            const saved = JSON.parse(localStorage.getItem('alJadoFirebaseConfig'));
            if (saved && saved.databaseURL) return saved;
        } catch (e) {}
        if (DEFAULT_FIREBASE_CONFIG && DEFAULT_FIREBASE_CONFIG.databaseURL && DEFAULT_FIREBASE_CONFIG.databaseURL.trim() !== "") {
            return DEFAULT_FIREBASE_CONFIG;
        }
        return null;
    }

    function getSavedCloudPin() {
        return (localStorage.getItem('alJadoCloudPin') || '').trim();
    }

    function updateCloudBadge(status, text) {
        const dot = document.getElementById('cloudStatusDot');
        const label = document.getElementById('cloudStatusText');
        if (!dot || !label) return;
        dot.className = 'cloud-dot';
        if (status === 'online') dot.classList.add('online');
        else if (status === 'error') dot.classList.add('error');
        label.innerText = text;
    }

    function initFirebaseSync() {
        const config = getActiveFirebaseConfig();
        const secretPin = getSavedCloudPin();

        if (!config || !config.databaseURL) {
            updateCloudBadge('local', '🔐 التخزين المركزي: غير متصل');
            return;
        }

        if (!secretPin) {
            updateCloudBadge('local', '🔐 التخزين المركزي: أدخل رمز المرور');
            openCloudModal();
            return;
        }

        if (typeof firebase === 'undefined') {
            updateCloudBadge('error', '⚠️ تعذر الاتصال بالتخزين المركزي');
            return;
        }

        try {
            updateCloudBadge('local', '⏳ جاري مزامنة البيانات...');
            let app;
            if (!firebase.apps.length) {
                app = firebase.initializeApp(config);
            } else {
                app = firebase.app();
            }

            const db = firebase.database(app);
            if (firebaseDbRef) {
                firebaseDbRef.off();
            }

            // المسار المحمي بكلمة السر داخل قاعدة البيانات
            firebaseDbRef = db.ref(`alJadoProtected/${secretPin}/alJadoSystemData`);

            firebaseDbRef.on('value', (snapshot) => {
                if (snapshot.exists()) {
                    const cloudData = snapshot.val();
                    isApplyingCloudUpdate = true;

                    memory = Array.isArray(cloudData.memory)
                        ? cloudData.memory
                        : (cloudData.memory ? Object.values(cloudData.memory) : []);

                    agentProfitStatus = cloudData.agentProfitStatus || {};

                    siteCharges = Array.isArray(cloudData.siteCharges)
                        ? cloudData.siteCharges
                        : (cloudData.siteCharges ? Object.values(cloudData.siteCharges) : []);

                    companyPayments = Array.isArray(cloudData.companyPayments)
                        ? cloudData.companyPayments
                        : (cloudData.companyPayments ? Object.values(cloudData.companyPayments) : []);

                    saveLocalOnly();
                    refreshAllViews();
                    isApplyingCloudUpdate = false;
                    updateCloudBadge('online', '🔐 التخزين المركزي: متصل ومحمي');
                } else {
                    if (memory.length > 0 || siteCharges.length > 0 || companyPayments.length > 0) {
                        syncToCloud();
                    }
                    updateCloudBadge('online', '🔐 التخزين المركزي: متصل ومحمي');
                }
            }, (error) => {
                console.error("Sync Error:", error);
                if (error && error.code === 'PERMISSION_DENIED') {
                    updateCloudBadge('error', '🔒 رمز المرور غير صحيح (اضغط للتعديل)');
                } else {
                    updateCloudBadge('error', '⚠️ خطأ اتصال بالتخزين المركزي');
                }
            });
        } catch (err) {
            console.error("Init Error:", err);
            updateCloudBadge('error', '⚠️ خطأ في إعدادات التخزين المركزي');
        }
    }

    function saveLocalOnly() {
        localStorage.setItem('alJadoDatabase', JSON.stringify(memory));
        localStorage.setItem('agentProfitStatus', JSON.stringify(agentProfitStatus));
        localStorage.setItem('alJadoSiteCharges', JSON.stringify(siteCharges));
        localStorage.setItem('alJadoCompanyPayments', JSON.stringify(companyPayments));
    }

    function syncToCloud() {
        saveLocalOnly();
        if (!firebaseDbRef || isApplyingCloudUpdate) return;

        firebaseDbRef.set({
            memory: memory,
            agentProfitStatus: agentProfitStatus,
            siteCharges: siteCharges,
            companyPayments: companyPayments,
            lastUpdated: new Date().toISOString()
        }).then(() => {
            updateCloudBadge('online', '🔐 التخزين المركزي: متزامن');
        }).catch((err) => {
            console.error("Write Error:", err);
            if (err && err.code === 'PERMISSION_DENIED') {
                updateCloudBadge('error', '🔒 رُفض الحفظ: تأكد من رمز المرور');
            } else {
                updateCloudBadge('error', '⚠️ تعذر الحفظ في التخزين المركزي');
            }
        });
    }

    function refreshAllViews() {
        loadArchive();
        buildDropdown();
        renderAgentsControl();
        updateCumulativeCalculations();
        updateTreasury();
        runRangeFilter();
    }

    function openCloudModal() {
        const modal = document.getElementById('cloudModal');
        const pinInput = document.getElementById('firebasePinInput');
        if (pinInput) {
            pinInput.value = getSavedCloudPin();
        }
        modal.style.display = 'flex';
        if (pinInput) setTimeout(() => pinInput.focus(), 100);
    }

    function closeCloudModal() {
        document.getElementById('cloudModal').style.display = 'none';
    }

    function togglePinVisibility() {
        const pinInput = document.getElementById('firebasePinInput');
        if (!pinInput) return;
        pinInput.type = pinInput.type === 'password' ? 'text' : 'password';
    }

    function saveCloudConfigFromModal() {
        const pinInput = document.getElementById('firebasePinInput');
        const pin = (pinInput ? pinInput.value : '').trim();

        if (!pin) {
            alert("يرجى إدخال رمز المرور أولاً!");
            if (pinInput) pinInput.focus();
            return;
        }
        if (/[.#$\[\]\/]/.test(pin)) {
            alert("يرجى عدم استخدام الرموز (. # $ [ ] /) داخل رمز المرور.");
            return;
        }

        localStorage.setItem('alJadoCloudPin', pin);
        closeCloudModal();
        initFirebaseSync();
    }

    function forcePushLocalToCloud() {
        if (!firebaseDbRef) {
            alert("يرجى إدخال رمز المرور وتأكيد الاتصال أولاً!");
            return;
        }
        syncToCloud();
        alert("✅ تم تحديث البيانات في التخزين المركزي بنجاح!");
    }

    // ============================================================================
    // المنطق الأساسي للتطبيق (محفوظ 100% كما هو)
    // ============================================================================
    function changeMonthArchive() {
        const selectedMonth = document.getElementById('monthSelector').value;
        if (selectedMonth) {
            document.getElementById('filterFromDate').value = selectedMonth + "-01";
            const year = selectedMonth.split('-')[0];
            const month = selectedMonth.split('-')[1];
            const lastDay = new Date(year, month, 0).getDate();
            document.getElementById('filterToDate').value = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
            
            runRangeFilter();
            calculateProfits(document.getElementById('docDate').value);
            updateCumulativeCalculations();
            updateTreasury();
        }
    }

    function buildDropdown() {
        const uniqueNames = [...new Set(memory.map(item => item.name.trim()))];
        const datalist = document.getElementById('agentsList');
        datalist.innerHTML = '';
        uniqueNames.forEach(name => {
            let option = document.createElement('option');
            option.value = name;
            datalist.appendChild(option);
            if (agentProfitStatus[name] === undefined) agentProfitStatus[name] = true;
        });
        localStorage.setItem('agentProfitStatus', JSON.stringify(agentProfitStatus));
    }

    function renderAgentsControl() {
        const uniqueNames = [...new Set(memory.map(item => item.name.trim()))];
        const container = document.getElementById('agentsControlContainer');
        if (uniqueNames.length === 0) {
            container.innerHTML = '<span style="color:#8a99ad; font-size:0.75rem;">لا يوجد وكلاء حالياً</span>';
            return;
        }
        container.innerHTML = '';
        uniqueNames.forEach(name => {
            const div = document.createElement('div');
            div.className = 'agent-chip';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `chk-agent-${name}`;
            checkbox.checked = agentProfitStatus[name] !== false;
            checkbox.onchange = (e) => {
                agentProfitStatus[name] = e.target.checked;
                localStorage.setItem('agentProfitStatus', JSON.stringify(agentProfitStatus));
                syncToCloud();
                calculateProfits(document.getElementById('docDate').value);
                runRangeFilter();
            };
            const label = document.createElement('label');
            label.htmlFor = `chk-agent-${name}`;
            label.innerText = name;
            div.appendChild(label);
            div.appendChild(checkbox);
            container.appendChild(div);
        });
    }

    // حساب المجاميع التراكمية مع فصل الواصل الكاش عن تسديد المدوّر
    function getCumulativeTotals(agentName, includeCurrentInputs = true) {
        let totalT = 0, totalW_Cash = 0, totalW_Combined = 0;
        const selectedMonth = document.getElementById('monthSelector').value;

        memory.forEach(op => {
            const opMonth = op.date ? op.date.substring(0, 7) : '';
            if (op.name.trim().toLowerCase() === agentName.trim().toLowerCase() && opMonth === selectedMonth) {
                totalT += Number(op.t);
                const wCash = Number(op.w) || 0;
                const rollover = Number(op.rollover) || 0;
                
                totalW_Cash += wCash;
                totalW_Combined += (wCash + rollover);
            }
        });

        if (includeCurrentInputs) {
            totalT += Number(document.getElementById('inputT').value) || 0;
            const curCash = Number(document.getElementById('inputW').value) || 0;
            const curRollover = Number(document.getElementById('inputRollover').value) || 0;
            
            totalW_Cash += curCash;
            totalW_Combined += (curCash + curRollover);
        }

        return { 
            T: totalT, 
            W_Cash: totalW_Cash,           // الكاش الفعلي فقط للخزينة
            W_Combined: totalW_Combined,   // الواصل الكلي لمسح دين الوكيل
            B: totalT - totalW_Combined    // الباقي المستحق للوكيل
        };
    }

    function updateCumulativeCalculations() {
        const name = document.getElementById('agentName').value.trim();
        const agentPer = Number(document.getElementById('inputAgentPercent').value) || 0;

        if (!name) {
            document.getElementById('liveT').innerText = '0';
            document.getElementById('liveW').innerText = '0';
            document.getElementById('liveB').innerText = '0';
            document.getElementById('alarmCard').style.display = 'none';
            return;
        }

        const cum = getCumulativeTotals(name, true);
        document.getElementById('liveT').innerText = formatNum(cum.T);
        document.getElementById('liveW').innerText = formatNum(cum.W_Combined); // يعرض الواصل الكلي للوكيل
        document.getElementById('liveB').innerText = formatNum(cum.B);

        if (agentPer > 0 && cum.T > 0) {
            const expectedCumulativeCash = cum.T * ((100 - agentPer) / 100);
            if (cum.W_Combined < expectedCumulativeCash) {
                currentAlarmExcess = expectedCumulativeCash - cum.W_Combined;
                document.getElementById('alarmMessage').innerText = `إجمالي الحساب التراكمي للوكيل [${name}] يتجاوز النسبة (${agentPer}%). نقص الواصل التراكمي المطلوب للشهر: (${formatNum(Math.round(currentAlarmExcess))}) ليرة.`;
                document.getElementById('alarmCard').style.display = 'block';
            } else {
                document.getElementById('alarmCard').style.display = 'none';
            }
        } else {
            document.getElementById('alarmCard').style.display = 'none';
        }
    }

    function saveTransaction() {
        const date = document.getElementById('docDate').value;
        const name = document.getElementById('agentName').value.trim();
        const t = Number(document.getElementById('inputT').value) || 0;
        const w = Number(document.getElementById('inputW').value) || 0;
        const rollover = Number(document.getElementById('inputRollover').value) || 0;
        
        const myPerStr = document.getElementById('inputMyPercent').value;
        const agentPerStr = document.getElementById('inputAgentPercent').value;

        if (!date || !name) { alert("يرجى تحديد التاريخ واسم الوكيل!"); return; }

        let profit = 0;
        if (myPerStr !== "" || agentPerStr !== "") {
            const myPer = Number(myPerStr) || 0;
            const agentPer = Number(agentPerStr) || 0;
            profit = t * ((myPer - agentPer) / 100);
        }

        memory.push({ id: Date.now() + Math.random().toString(36).substr(2, 5), date, name, t, w, rollover, profit });
        localStorage.setItem('alJadoDatabase', JSON.stringify(memory));

        document.getElementById('inputT').value = '';
        document.getElementById('inputW').value = '';
        document.getElementById('inputRollover').value = '';
        loadArchive();
        buildDropdown();
        renderAgentsControl();
        updateCumulativeCalculations();
        updateTreasury();
        runRangeFilter();
        syncToCloud();
    }

    function loadArchive() {
        const filterDate = document.getElementById('docDate').value;
        document.getElementById('archiveTitle').innerText = `📂 سجل حركات اليوم المحدد (${filterDate})`;

        const dayOps = memory.filter(op => op.date === filterDate);
        renderTableRows(dayOps);
        calculateProfits(filterDate);
    }

    function renderTableRows(opsList) {
        currentDisplayedOps = opsList || [];
        const tbody = document.getElementById('archiveTableBody');
        tbody.innerHTML = '';
        opsList.forEach(op => {
            const currentCum = getCumulativeTotals(op.name, false);
            const opDisplayW = (Number(op.w) || 0) + (Number(op.rollover) || 0);
            let tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${op.date}</td>
                <td><strong>${op.name}</strong></td>
                <td>${formatNum(op.t)}</td>
                <td>${formatNum(opDisplayW)}</td>
                <td style="color:${op.profit < 0 ? 'var(--cyber-red)' : 'var(--cyber-green)'}; font-weight:bold;">${formatNum(op.profit)}</td>
                <td style="color:var(--cyber-yellow); font-weight:bold;">${formatNum(currentCum.B)}</td>
                <td><button class="btn btn-outline-red" style="padding:2px 8px; font-size:0.75rem;" onclick="deleteTransaction('${op.id}')">حذف</button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    function runRangeFilter() {
        const fromDate = document.getElementById('filterFromDate').value;
        const toDate = document.getElementById('filterToDate').value;

        if (!fromDate || !toDate) return;

        let totalT = 0, totalW = 0, totalProfit = 0;

        const filteredOps = memory.filter(op => {
            const isInRange = op.date >= fromDate && op.date <= toDate;
            if (isInRange) {
                const isActive = agentProfitStatus[op.name.trim()] !== false;
                totalT += Number(op.t);
                totalW += ((Number(op.w) || 0) + (Number(op.rollover) || 0));
                if (isActive) totalProfit += Number(op.profit);
            }
            return isInRange;
        });

        document.getElementById('rangeTotalT').innerText = formatNum(totalT);
        document.getElementById('rangeTotalW').innerText = formatNum(totalW);
        document.getElementById('rangeTotalProfit').innerText = formatNum(totalProfit);
        document.getElementById('rangeTotalB').innerText = formatNum(totalT - totalW);

        document.getElementById('archiveTitle').innerText = `📂 سجل حركات الفترة من (${fromDate}) إلى (${toDate})`;
        renderTableRows(filteredOps);
    }

    function calculateProfits(filterDate) {
        let dailyProfit = 0, monthlyProfit = 0, dailyT = 0, dailyW = 0;
        const selectedMonth = document.getElementById('monthSelector').value || filterDate.substring(0, 7);

        memory.forEach(op => {
            const isActive = agentProfitStatus[op.name.trim()] !== false;
            if (op.date === filterDate) {
                dailyT += Number(op.t);
                dailyW += ((Number(op.w) || 0) + (Number(op.rollover) || 0));
                if (isActive) dailyProfit += Number(op.profit);
            }
            if (op.date.substring(0, 7) === selectedMonth && isActive) {
                monthlyProfit += Number(op.profit);
            }
        });

        document.getElementById('dailyProfitDisplay').innerText = `${formatNum(dailyProfit)} ليرة`;
        document.getElementById('monthlyProfitDisplay').innerText = `${formatNum(monthlyProfit)} ليرة`;
        document.getElementById('dailyTDisplay').innerText = `${formatNum(dailyT)} ليرة`;
        document.getElementById('dailyWDisplay').innerText = `${formatNum(dailyW)} ليرة`;
    }

    function addSiteCharge() {
        const val = Number(document.getElementById('siteChargeInput').value);
        const selectedMonth = document.getElementById('monthSelector').value || document.getElementById('docDate').value.substring(0, 7);
        const fullDate = document.getElementById('docDate').value;
        
        if (val !== 0 && !isNaN(val)) {
            siteCharges.push({ id: Date.now(), amount: val, date: fullDate, month: selectedMonth });
            localStorage.setItem('alJadoSiteCharges', JSON.stringify(siteCharges));
            document.getElementById('siteChargeInput').value = '';
            updateTreasury();
            syncToCloud();
        }
    }

    function deleteSiteCharge(id) {
        if (confirm("حذف هذه الشحنة؟")) {
            siteCharges = siteCharges.filter(x => x.id !== id);
            localStorage.setItem('alJadoSiteCharges', JSON.stringify(siteCharges));
            updateTreasury();
            syncToCloud();
        }
    }

    function addCompanyPayment() {
        const val = Number(document.getElementById('companyPaymentInput').value);
        const selectedMonth = document.getElementById('monthSelector').value || document.getElementById('docDate').value.substring(0, 7);
        const fullDate = document.getElementById('docDate').value;

        if (val !== 0 && !isNaN(val)) {
            companyPayments.push({ id: Date.now(), amount: val, date: fullDate, month: selectedMonth });
            localStorage.setItem('alJadoCompanyPayments', JSON.stringify(companyPayments));
            document.getElementById('companyPaymentInput').value = '';
            updateTreasury();
            syncToCloud();
        }
    }

    function deleteCompanyPayment(id) {
        if (confirm("حذف هذا التسديد؟")) {
            companyPayments = companyPayments.filter(x => x.id !== id);
            localStorage.setItem('alJadoCompanyPayments', JSON.stringify(companyPayments));
            updateTreasury();
            syncToCloud();
        }
    }

    // الخزينة تأخذ الكاش الفعلي (op.w) فقط وتحجم عن إدخال التسديد المدوّر
    function updateTreasury() {
        const selectedMonth = document.getElementById('monthSelector').value || document.getElementById('docDate').value.substring(0, 7);

        const monthChargesList = siteCharges.filter(x => (x.month || (x.date && x.date.substring(0, 7))) === selectedMonth);
        const monthPaymentsList = companyPayments.filter(x => (x.month || (x.date && x.date.substring(0, 7))) === selectedMonth);

        const totalCharges = monthChargesList.reduce((acc, c) => acc + c.amount, 0);
        const totalPaidCompany = monthPaymentsList.reduce((acc, c) => acc + c.amount, 0);

        let monthT = 0, monthW_CashOnly = 0;
        memory.forEach(op => {
            if (op.date && op.date.substring(0, 7) === selectedMonth) {
                monthT += Number(op.t);
                monthW_CashOnly += (Number(op.w) || 0); // كاش فعلي فقط للخزينة
            }
        });

        const remainingSite = totalCharges - monthT;
        const netPosition = (monthW_CashOnly + remainingSite) - totalPaidCompany;

        document.getElementById('totalSiteCharges').innerText = formatNum(totalCharges);
        document.getElementById('remainingSiteBalance').innerText = formatNum(remainingSite);
        document.getElementById('totalCollectedCash').innerText = formatNum(monthW_CashOnly);
        document.getElementById('totalCompanyPaid').innerText = formatNum(totalPaidCompany);
        document.getElementById('netTreasuryPosition').innerText = formatNum(netPosition);

        document.getElementById('siteChargesList').innerHTML = monthChargesList.map(x => `
            <div class="mini-item">
                <span>${x.amount < 0 ? 'سحب' : 'شحنة'}: ${formatNum(x.amount)}</span>
                <div>
                    <span style="margin-left: 6px;">${x.date}</span>
                    <button class="btn-del-small" onclick="deleteSiteCharge(${x.id})">✖</button>
                </div>
            </div>
        `).join('');

        document.getElementById('companyPaymentsList').innerHTML = monthPaymentsList.map(x => `
            <div class="mini-item">
                <span>${x.amount < 0 ? 'استلام' : 'تسديد'}: ${formatNum(x.amount)}</span>
                <div>
                    <span style="margin-left: 6px;">${x.date}</span>
                    <button class="btn-del-small" onclick="deleteCompanyPayment(${x.id})">✖</button>
                </div>
            </div>
        `).join('');
    }

    function deleteTransaction(id) {
        if (confirm("حذف هذه العملية؟")) {
            memory = memory.filter(op => op.id !== id);
            localStorage.setItem('alJadoDatabase', JSON.stringify(memory));
            loadArchive();
            updateCumulativeCalculations();
            updateTreasury();
            runRangeFilter();
            syncToCloud();
        }
    }

    function deleteCurrentDayOps() {
        const filterDate = document.getElementById('docDate').value;
        if (confirm(`حذف جميع سجلات يوم (${filterDate})؟`)) {
            memory = memory.filter(op => op.date !== filterDate);
            localStorage.setItem('alJadoDatabase', JSON.stringify(memory));
            loadArchive();
            updateTreasury();
            runRangeFilter();
            syncToCloud();
        }
    }

    function clearAllDatabase() {
        if (confirm("تنويه: مسح كافة السجلات والخزينة بالكامل؟")) {
            const savedCloudCfg = localStorage.getItem('alJadoFirebaseConfig');
            const savedCloudPin = localStorage.getItem('alJadoCloudPin');
            memory = []; siteCharges = []; companyPayments = []; agentProfitStatus = {};
            localStorage.clear();
            if (savedCloudCfg) localStorage.setItem('alJadoFirebaseConfig', savedCloudCfg);
            if (savedCloudPin) localStorage.setItem('alJadoCloudPin', savedCloudPin);
            loadArchive(); buildDropdown(); renderAgentsControl(); updateTreasury(); runRangeFilter();
            syncToCloud();
        }
    }

    // رسالة الواتساب بدون أي تغيير في الهيكل الأصلي
    function copyWhatsApp() {
        const name = document.getElementById('agentName').value.trim();
        const date = document.getElementById('docDate').value;
        if (!name) return alert("اختر اسماً أولاً!");
        const cum = getCumulativeTotals(name, false);
        const msg = `👑 *AL-JADO TEAM* 👑\n----------------------\n👤 *العميل:* ${name}\n📅 *التاريخ:* ${date}\n\n• *التعبئة التراكمية (T):* ${formatNum(cum.T)}\n• *الواصل التراكمي (W):* ${formatNum(cum.W_Combined)}\n• *الباقي التراكمي (B):* ${formatNum(cum.B)}\n----------------------\n✅ *مطابقة الحساب التراكمي.*`;
        navigator.clipboard.writeText(msg).then(() => alert("تم نسخ الرسالة بنجاح!"));
    }

    // رسالة إنذار الواتساب بنفس الهيكل والتنسيق الأصلي بدون أي تعديل
    function copyAlarmWhatsApp() {
        const name = document.getElementById('agentName').value.trim();
        const date = document.getElementById('docDate').value;
        const agentPer = Number(document.getElementById('inputAgentPercent').value) || 0;
        const excessFormatted = formatNum(Math.round(currentAlarmExcess));

        if (!name) return alert("يرجى اختيار أو كتابة اسم الوكيل أولاً!");

        const msg = `*⚠️ ⚠️ [${excessFormatted}] ⚠️⚠️*\n\n\n` +
                    `*☢️ AL-JADO TEAM ☢️*\n` +
                    `*[${date}] - [${name}]*\n` +
                    `*⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️*\n` +
                    `*تجاوز نسبة ([${agentPer}]%)*\n` +
                    `*⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️*\n` +
                    `*فرق النسبة: [${excessFormatted}]*\n\n` +
                    `🔴 *الرجاء التسديد يا ملك* 🔴`;

        navigator.clipboard.writeText(msg).then(() => alert("تم نسخ إنذار الواتساب بالصيغة الجديدة!"));
    }

    function runCalc2() {
        const cash = Number(document.getElementById('calc2Cash').value) || 0;
        const per = Number(document.getElementById('calc2Percent').value) || 0;
        document.getElementById('calc2Result').innerText = formatNum(Math.round(per > 0 ? cash / ((100 - per) / 100) : cash));
    }

    function runCalc3() {
        const amt = Number(document.getElementById('calc3Amount').value) || 0;
        const per = Number(document.getElementById('calc3Percent').value) || 0;
        document.getElementById('calc3Result').innerText = formatNum(Math.round(per > 0 ? amt * ((100 - per) / 100) : amt));
    }

    function runReverseCalc() {
        const cash = Number(document.getElementById('calcReverseCash').value) || 0;
        const per = Number(document.getElementById('calcReversePercent').value) || 0;
        document.getElementById('calcReverseResult').innerText = formatNum(Math.round(per > 0 ? cash / ((100 - per) / 100) : cash));
    }

    function runDebtCalc() {
        const oldD = Number(document.getElementById('calcOldDebt').value) || 0;
        const newD = Number(document.getElementById('calcNewDebt').value) || 0;
        document.getElementById('calcDebtResult').innerText = formatNum(oldD + newD);
    }

    function runGameCalc() {
        const amt = Number(document.getElementById('calcGameAmount').value) || 0;
        const per = Number(document.getElementById('calcGamePercent').value) || 0;
        const diff = amt * (per / 100);
        document.getElementById('calcGameNet').innerText = formatNum(Math.round(amt - diff));
        document.getElementById('calcGameDiff').innerText = formatNum(Math.round(diff));
    }

    // ============================================================================
    // 📥 منظومة التصدير والتقارير (CSV + HTML Report + PDF Print + JSON Backup)
    // ============================================================================
    function getExportTargetData() {
        const scope = document.getElementById('exportScopeSelect')
            ? document.getElementById('exportScopeSelect').value
            : 'current';
        const selectedMonth = document.getElementById('monthSelector').value || document.getElementById('docDate').value.substring(0, 7);

        let ops = [];
        let scopeTitle = '';

        if (scope === 'current') {
            ops = currentDisplayedOps;
            scopeTitle = document.getElementById('archiveTitle').innerText.replace('📂 ', '');
        } else if (scope === 'month') {
            ops = memory.filter(op => op.date && op.date.substring(0, 7) === selectedMonth);
            scopeTitle = `حركات شهر (${selectedMonth})`;
        } else {
            ops = [...memory];
            scopeTitle = 'السجل الشامل لكافة الحركات';
        }

        return { ops, scopeTitle, selectedMonth };
    }

    function escapeCsvCell(val) {
        const str = String(val ?? '').replace(/"/g, '""');
        return `"${str}"`;
    }

    function exportDataAsCSV() {
        const { ops, scopeTitle, selectedMonth } = getExportTargetData();

        let csvLines = [];
        csvLines.push([escapeCsvCell(`AL-JADO TEAM - ${scopeTitle}`)].join(','));
        csvLines.push('');

        // رؤوس جدول الحركات
        csvLines.push([
            'التاريخ',
            'الوكيل',
            'التعبئة (T)',
            'الواصل كاش (W)',
            'رصيد مدوّر / تسديد سابق',
            'إجمالي الواصل (W + مدوّر)',
            'الربح الصافي',
            'الباقي التراكمي للشهر (B)'
        ].map(escapeCsvCell).join(','));

        let sumT = 0, sumWCash = 0, sumRollover = 0, sumWCombined = 0, sumProfit = 0;

        ops.forEach(op => {
            const t = Number(op.t) || 0;
            const wCash = Number(op.w) || 0;
            const rollover = Number(op.rollover) || 0;
            const wTotal = wCash + rollover;
            const profit = Number(op.profit) || 0;
            const currentCum = getCumulativeTotals(op.name, false);

            sumT += t;
            sumWCash += wCash;
            sumRollover += rollover;
            sumWCombined += wTotal;
            if (agentProfitStatus[op.name.trim()] !== false) {
                sumProfit += profit;
            }

            csvLines.push([
                op.date,
                op.name,
                t,
                wCash,
                rollover,
                wTotal,
                profit,
                currentCum.B
            ].map(escapeCsvCell).join(','));
        });

        // صف المجموع
        csvLines.push([
            'الإجمالي',
            `عدد الحركات: ${ops.length}`,
            sumT,
            sumWCash,
            sumRollover,
            sumWCombined,
            sumProfit,
            sumT - sumWCombined
        ].map(escapeCsvCell).join(','));

        // ملخص الخزينة للشهر المحدد
        csvLines.push('');
        csvLines.push([escapeCsvCell(`ملخص الخزينة لشهر (${selectedMonth})`)].join(','));
        csvLines.push([
            'إجمالي شحنات الشهر',
            'المتبقي بالسيستم للشهر',
            'الكاش المجمع للشهر (W)',
            'المدفوع للشركة للشهر',
            'موقف الخزينة للشهر'
        ].map(escapeCsvCell).join(','));

        csvLines.push([
            document.getElementById('totalSiteCharges').innerText,
            document.getElementById('remainingSiteBalance').innerText,
            document.getElementById('totalCollectedCash').innerText,
            document.getElementById('totalCompanyPaid').innerText,
            document.getElementById('netTreasuryPosition').innerText
        ].map(escapeCsvCell).join(','));

        const csvContent = '\uFEFF' + csvLines.join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const dateStamp = document.getElementById('docDate').value || new Date().toISOString().split('T')[0];
        link.href = url;
        link.download = `AL-JADO-Report-${dateStamp}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function exportFormattedReport(mode) {
        const { ops, scopeTitle, selectedMonth } = getExportTargetData();
        const dateStamp = document.getElementById('docDate').value || new Date().toISOString().split('T')[0];

        let sumT = 0, sumWCash = 0, sumRollover = 0, sumWCombined = 0, sumProfit = 0;

        const rowsHtml = ops.map((op, idx) => {
            const t = Number(op.t) || 0;
            const wCash = Number(op.w) || 0;
            const rollover = Number(op.rollover) || 0;
            const wTotal = wCash + rollover;
            const profit = Number(op.profit) || 0;
            const currentCum = getCumulativeTotals(op.name, false);

            sumT += t;
            sumWCash += wCash;
            sumRollover += rollover;
            sumWCombined += wTotal;
            if (agentProfitStatus[op.name.trim()] !== false) {
                sumProfit += profit;
            }

            return `
                <tr>
                    <td>${idx + 1}</td>
                    <td>${op.date}</td>
                    <td><strong>${op.name}</strong></td>
                    <td>${formatNum(t)}</td>
                    <td>${formatNum(wCash)}</td>
                    <td>${formatNum(rollover)}</td>
                    <td><strong>${formatNum(wTotal)}</strong></td>
                    <td style="color: ${profit < 0 ? '#d93025' : '#0d8043'}; font-weight: bold;">${formatNum(profit)}</td>
                    <td style="color: #b06000; font-weight: bold;">${formatNum(currentCum.B)}</td>
                </tr>
            `;
        }).join('');

        const reportHtml = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>تقرير AL-JADO TEAM - ${dateStamp}</title>
    <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Tajawal', sans-serif; }
        body { background: #f4f6f9; color: #1a202c; padding: 24px; }
        .report-wrapper { max-width: 1150px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; }
        .report-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #00a8cc; padding-bottom: 16px; margin-bottom: 22px; flex-wrap: wrap; gap: 12px; }
        .report-header h1 { color: #0b132b; font-size: 1.7rem; font-weight: 900; }
        .report-header p { color: #4a5568; font-size: 0.9rem; margin-top: 4px; font-weight: 700; }
        .meta-box { text-align: left; font-size: 0.85rem; color: #4a5568; background: #f8fafc; padding: 10px 14px; border-radius: 10px; border: 1px solid #e2e8f0; }
        .cards-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 22px; }
        .summary-card { background: #f8fafc; border: 1px solid #cbd5e1; border-right: 5px solid #00a8cc; border-radius: 10px; padding: 14px; }
        .summary-card span { font-size: 0.8rem; color: #64748b; display: block; margin-bottom: 4px; font-weight: 700; }
        .summary-card strong { font-size: 1.25rem; color: #0f172a; font-weight: 900; }
        .section-title { font-size: 1.05rem; font-weight: 800; color: #0f172a; margin: 18px 0 10px; padding-right: 10px; border-right: 4px solid #00a8cc; }
        table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 20px; }
        th { background: #0f172a; color: #ffffff; padding: 10px 8px; text-align: right; font-weight: 700; }
        td { padding: 9px 8px; border-bottom: 1px solid #e2e8f0; }
        tr:nth-child(even) { background: #f8fafc; }
        tfoot tr { background: #e2e8f0 !important; font-weight: 900; font-size: 0.9rem; }
        .print-toolbar { display: flex; gap: 10px; margin-bottom: 16px; justify-content: flex-end; }
        .print-btn { background: #00a8cc; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 800; cursor: pointer; font-size: 0.9rem; }
        @media print {
            body { background: #fff; padding: 0; }
            .report-wrapper { box-shadow: none; border: none; padding: 10px; }
            .print-toolbar { display: none !important; }
        }
        @media (max-width: 768px) {
            .cards-grid { grid-template-columns: repeat(2, 1fr); }
        }
    </style>
</head>
<body>
    <div class="report-wrapper">
        <div class="print-toolbar">
            <button class="print-btn" onclick="window.print()">🖨️ طباعة / حفظ كملف PDF</button>
        </div>

        <div class="report-header">
            <div>
                <h1>👑 AL-JADO TEAM</h1>
                <p>تقرير منظومة الإدارة المحاسبية والخزينة المركزية — ${scopeTitle}</p>
            </div>
            <div class="meta-box">
                <div><strong>تاريخ التقرير:</strong> ${dateStamp}</div>
                <div><strong>أرشيف الشهر:</strong> ${selectedMonth}</div>
                <div><strong>عدد الحركات:</strong> ${ops.length}</div>
            </div>
        </div>

        <div class="cards-grid">
            <div class="summary-card">
                <span>إجمالي التعبئة (T)</span>
                <strong>${formatNum(sumT)} ليرة</strong>
            </div>
            <div class="summary-card" style="border-right-color: #0d8043;">
                <span>إجمالي الواصل الكلي (W)</span>
                <strong>${formatNum(sumWCombined)} ليرة</strong>
            </div>
            <div class="summary-card" style="border-right-color: #0d8043;">
                <span>صافي الأرباح</span>
                <strong>${formatNum(sumProfit)} ليرة</strong>
            </div>
            <div class="summary-card" style="border-right-color: #d97706;">
                <span>صافي الفرق المستحق (B)</span>
                <strong>${formatNum(sumT - sumWCombined)} ليرة</strong>
            </div>
        </div>

        <h3 class="section-title">🏦 موقف الخزينة للشهر المحدد (${selectedMonth})</h3>
        <table>
            <thead>
                <tr>
                    <th>إجمالي شحنات الشهر</th>
                    <th>المتبقي بالسيستم للشهر</th>
                    <th>الكاش المجمع للشهر (W)</th>
                    <th>المدفوع للشركة للشهر</th>
                    <th>موقف الخزينة للشهر</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><strong>${document.getElementById('totalSiteCharges').innerText}</strong></td>
                    <td><strong>${document.getElementById('remainingSiteBalance').innerText}</strong></td>
                    <td><strong>${document.getElementById('totalCollectedCash').innerText}</strong></td>
                    <td><strong>${document.getElementById('totalCompanyPaid').innerText}</strong></td>
                    <td><strong>${document.getElementById('netTreasuryPosition').innerText}</strong></td>
                </tr>
            </tbody>
        </table>

        <h3 class="section-title">📂 جدول الحركات التفصيلي (${scopeTitle})</h3>
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>التاريخ</th>
                    <th>الوكيل</th>
                    <th>التعبئة (T)</th>
                    <th>واصل كاش (W)</th>
                    <th>رصيد مدوّر</th>
                    <th>إجمالي الواصل</th>
                    <th>الربح الصافي</th>
                    <th>الباقي التراكمي للشهر (B)</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml || '<tr><td colspan="9" style="text-align:center; padding: 20px;">لا توجد حركات مسجلة في هذا النطاق</td></tr>'}
            </tbody>
            <tfoot>
                <tr>
                    <td colspan="3">المجموع الكلي (${ops.length} حركة)</td>
                    <td>${formatNum(sumT)}</td>
                    <td>${formatNum(sumWCash)}</td>
                    <td>${formatNum(sumRollover)}</td>
                    <td>${formatNum(sumWCombined)}</td>
                    <td>${formatNum(sumProfit)}</td>
                    <td>${formatNum(sumT - sumWCombined)}</td>
                </tr>
            </tfoot>
        </table>
    </div>
</body>
</html>`;

        if (mode === 'html') {
            const blob = new Blob([reportHtml], { type: 'text/html;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `AL-JADO-Report-${dateStamp}.html`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } else {
            const printWin = window.open('', '_blank');
            if (!printWin) {
                alert("يرجى السماح بالنوافذ المنبثقة (Pop-ups) لفتح نافذة طباعة PDF.");
                return;
            }
            printWin.document.open();
            printWin.document.write(reportHtml);
            printWin.document.close();
            printWin.onload = () => {
                setTimeout(() => printWin.print(), 350);
            };
        }
    }

    function downloadFullBackupJSON() {
        const backupObj = {
            app: "AL-JADO TEAM",
            exportedAt: new Date().toISOString(),
            memory: memory,
            agentProfitStatus: agentProfitStatus,
            siteCharges: siteCharges,
            companyPayments: companyPayments
        };
        const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const dateStamp = document.getElementById('docDate').value || new Date().toISOString().split('T')[0];
        link.href = url;
        link.download = `AL-JADO-Backup-${dateStamp}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function restoreBackupFromJSON(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data || (!Array.isArray(data.memory) && !data.siteCharges)) {
                    alert("⚠️ ملف النسخة الاحتياطية غير صالح!");
                    return;
                }
                if (confirm("هل أنت متأكد من استعادة هذه النسخة الاحتياطية؟ سيتم استبدال البيانات الحالية وتحديث التخزين المركزي.")) {
                    memory = Array.isArray(data.memory) ? data.memory : [];
                    agentProfitStatus = data.agentProfitStatus || {};
                    siteCharges = Array.isArray(data.siteCharges) ? data.siteCharges : [];
                    companyPayments = Array.isArray(data.companyPayments) ? data.companyPayments : [];
                    refreshAllViews();
                    syncToCloud();
                    alert("✅ تم استعادة النسخة الاحتياطية بنجاح!");
                }
            } catch (err) {
                alert("⚠️ حدث خطأ أثناء قراءة ملف النسخة الاحتياطية!");
            }
            event.target.value = '';
        };
        reader.readAsText(file);
    }
