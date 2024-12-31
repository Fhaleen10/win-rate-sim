let balanceChart = null;
let balanceDrawdownChart = null;
let drawdownChart = null;
let simulationTradeHistory = [];

function runMonteCarloSimulation(initialBalance, riskPerTrade, winRate, profitLossRatio, numberOfTrades, commissionPercent, numSimulations) {
    const results = [];
    simulationTradeHistory = [];
    
    for (let sim = 0; sim < numSimulations; sim++) {
        let balance = initialBalance;
        const trades = [];
        
        for (let trade = 0; trade < numberOfTrades; trade++) {
            const riskAmount = (balance * (riskPerTrade / 100));
            const isWin = Math.random() * 100 < winRate;
            const commission = balance * (commissionPercent / 100);
            
            // Subtract commission
            balance -= commission;
            
            let tradeResult;
            if (isWin) {
                tradeResult = riskAmount * profitLossRatio;
                balance += tradeResult;
            } else {
                tradeResult = -riskAmount;
                balance += tradeResult;
            }
            
            trades.push({
                tradeNumber: trade + 1,
                isWin,
                startBalance: balance - tradeResult,
                endBalance: balance,
                riskAmount,
                tradeResult,
                commission
            });
            
            // If balance goes to 0 or negative, break the simulation
            if (balance <= 0) {
                balance = 0;
                break;
            }
        }
        
        results.push({
            finalBalance: balance,
            trades: trades,
            return: ((balance - initialBalance) / initialBalance) * 100
        });
    }
    
    return results;
}

function calculateDrawdown(trades) {
    let peak = trades[0].startBalance;
    let maxDrawdown = 0;
    
    for (const trade of trades) {
        const currentBalance = trade.endBalance;
        if (currentBalance > peak) {
            peak = currentBalance;
        }
        const drawdown = ((peak - currentBalance) / peak) * 100;
        if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
        }
    }
    
    return maxDrawdown;
}

function calculateResults() {
    // Get input values
    const initialBalance = parseFloat(document.getElementById('accountBalance').value);
    const riskPerTrade = parseFloat(document.getElementById('riskPerTrade').value);
    const winRate = parseFloat(document.getElementById('winRate').value);
    const profitLossRatio = parseFloat(document.getElementById('profitLossRatio').value);
    const numberOfTrades = parseInt(document.getElementById('numberOfTrades').value);
    const commissionPercent = parseFloat(document.getElementById('commission').value) || 0;
    const numSimulations = parseInt(document.getElementById('simulations').value) || 1000;

    // Validate inputs
    if (!initialBalance || !riskPerTrade || !winRate || !profitLossRatio || !numberOfTrades) {
        alert('Please fill in all required fields with valid numbers');
        return;
    }

    // Run Monte Carlo simulation
    const simulationResults = runMonteCarloSimulation(
        initialBalance,
        riskPerTrade,
        winRate,
        profitLossRatio,
        numberOfTrades,
        commissionPercent,
        numSimulations
    );

    // Sort simulations by return
    simulationResults.sort((a, b) => b.return - a.return);

    // Calculate statistics
    const bestCase = simulationResults[0];
    const worstCase = simulationResults[simulationResults.length - 1];
    const averageCase = simulationResults[Math.floor(simulationResults.length / 2)];
    const averageReturn = simulationResults.reduce((sum, sim) => sum + sim.return, 0) / numSimulations;
    const averageProfit = (averageReturn / 100) * initialBalance;
    const averageFinalBalance = initialBalance + averageProfit;

    // Calculate drawdowns
    const bestCaseDrawdown = calculateDrawdown(bestCase.trades);
    const averageCaseDrawdown = calculateDrawdown(averageCase.trades);
    const worstCaseDrawdown = calculateDrawdown(worstCase.trades);
    
    // Calculate average drawdown across all simulations
    const averageDrawdown = simulationResults.reduce((sum, sim) => {
        return sum + calculateDrawdown(sim.trades);
    }, 0) / numSimulations;

    const profitableRuns = simulationResults.filter(sim => sim.finalBalance > initialBalance).length;
    const probabilityOfProfit = (profitableRuns / numSimulations) * 100;

    // Store simulations for detail view
    simulationTradeHistory = simulationResults.map(sim => sim.trades);
    window.bestCaseIndex = 0;
    window.averageCaseIndex = Math.floor(simulationResults.length / 2);
    window.worstCaseIndex = simulationResults.length - 1;

    // Calculate total commission for average case
    const totalCommissionCost = averageCase.trades.reduce((sum, trade) => sum + trade.commission, 0);

    // Calculate average balance progression
    const averageBalances = new Array(numberOfTrades + 1).fill(0);
    averageBalances[0] = initialBalance;
    
    // Calculate average balance at each trade point
    for (let tradeIndex = 0; tradeIndex < numberOfTrades; tradeIndex++) {
        let totalBalance = 0;
        let activeSimulations = 0;
        
        // For each simulation, get the balance at this trade index
        for (let sim = 0; sim < simulationResults.length; sim++) {
            const trades = simulationResults[sim].trades;
            if (trades[tradeIndex]) {
                totalBalance += trades[tradeIndex].endBalance;
                activeSimulations++;
            }
        }
        
        // Calculate average balance for this trade point
        if (activeSimulations > 0) {
            averageBalances[tradeIndex + 1] = totalBalance / activeSimulations;
        } else {
            // If no active simulations, use previous balance
            averageBalances[tradeIndex + 1] = averageBalances[tradeIndex];
        }
    }

    // Update the balance chart
    updateBalanceChart(averageBalances);

    // Calculate average drawdown progression
    const averageDrawdowns = new Array(numberOfTrades + 1).fill(0);
    averageDrawdowns[0] = 0;

    // Calculate drawdown for each simulation first
    for (let sim = 0; sim < simulationResults.length; sim++) {
        const trades = simulationResults[sim].trades;
        let runningPeak = initialBalance;
        let currentDrawdown = 0;

        for (let tradeIndex = 0; tradeIndex < trades.length; tradeIndex++) {
            const currentBalance = trades[tradeIndex].endBalance;
            
            // Update peak if we have a new high
            if (currentBalance > runningPeak) {
                runningPeak = currentBalance;
                currentDrawdown = 0;
            } else {
                // Calculate current drawdown from peak
                currentDrawdown = ((runningPeak - currentBalance) / runningPeak) * 100;
            }

            // Add to total for averaging
            if (!averageDrawdowns[tradeIndex + 1]) {
                averageDrawdowns[tradeIndex + 1] = currentDrawdown;
            } else {
                averageDrawdowns[tradeIndex + 1] += currentDrawdown;
            }
        }
    }

    // Calculate averages
    for (let i = 1; i < averageDrawdowns.length; i++) {
        averageDrawdowns[i] = averageDrawdowns[i] / simulationResults.length;
    }

    // Update chart options to better show small drawdowns
    const maxDrawdown = Math.max(...averageDrawdowns);
    const yAxisMax = Math.max(5, Math.ceil(maxDrawdown * 1.2)); // At least 5% or 20% above max

    // Update UI with Monte Carlo average results
    document.getElementById('expectedProfit').textContent = formatCurrency(averageProfit);
    document.getElementById('finalBalance').textContent = formatCurrency(averageFinalBalance);
    document.getElementById('roi').textContent = formatPercentage(averageReturn);
    document.getElementById('totalCommission').textContent = formatCurrency(totalCommissionCost);

    // Update Monte Carlo statistics
    document.getElementById('bestCase').textContent = `${formatPercentage(bestCase.return)} (Max DD: ${formatPercentage(bestCaseDrawdown)})`;
    document.getElementById('averageCase').textContent = `${formatPercentage(averageCase.return)} (Max DD: ${formatPercentage(averageCaseDrawdown)})`;
    document.getElementById('worstCase').textContent = `${formatPercentage(worstCase.return)} (Max DD: ${formatPercentage(worstCaseDrawdown)})`;
    document.getElementById('profitProb').textContent = formatPercentage(probabilityOfProfit);

    // Update the chart
    updateChart(simulationResults.map(sim => sim.finalBalance), initialBalance);
    updateDrawdownChart(averageDrawdowns);
    
    // Show results section
    document.getElementById('results').style.display = 'block';

    // Automatically show average case details without scrolling
    showSimulationDetails(1);
}

function showSimulationDetails(type) {
    // Get the appropriate simulation based on type
    let simulationIndex;
    let title;
    switch(type) {
        case 0: // Best case
            simulationIndex = window.bestCaseIndex;
            title = 'Best Case Scenario';
            break;
        case 1: // Average case
            simulationIndex = window.averageCaseIndex;
            title = 'Average Case Scenario';
            break;
        case 2: // Worst case
            simulationIndex = window.worstCaseIndex;
            title = 'Worst Case Scenario';
            break;
        default:
            return;
    }
    
    const trades = simulationTradeHistory[simulationIndex];
    const initialBalance = trades[0].startBalance;
    const finalBalance = trades[trades.length - 1].endBalance;
    const totalReturn = ((finalBalance - initialBalance) / initialBalance) * 100;
    
    // Calculate total commission
    const totalCommission = trades.reduce((sum, trade) => sum + trade.commission, 0);

    // Calculate new statistics
    let maxDrawdown = 0;
    let totalDrawdown = 0;
    let highestBalance = initialBalance;
    let bestTrade = trades[0].tradeResult;
    let worstTrade = trades[0].tradeResult;
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let winStreaks = [];
    let lossStreaks = [];
    let totalWins = 0;
    let totalLosses = 0;
    let totalWinAmount = 0;
    let totalLossAmount = 0;

    trades.forEach(trade => {
        // Update highest balance and calculate drawdown
        highestBalance = Math.max(highestBalance, trade.endBalance);
        const drawdown = ((highestBalance - trade.endBalance) / highestBalance) * 100;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
        totalDrawdown += drawdown;

        // Update best and worst trades
        bestTrade = Math.max(bestTrade, trade.tradeResult);
        worstTrade = Math.min(worstTrade, trade.tradeResult);

        // Update win/loss streaks
        if (trade.isWin) {
            if (currentLossStreak > 0) {
                lossStreaks.push(currentLossStreak);
                currentLossStreak = 0;
            }
            currentWinStreak++;
            maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
            totalWins++;
            totalWinAmount += trade.tradeResult;
        } else {
            if (currentWinStreak > 0) {
                winStreaks.push(currentWinStreak);
                currentWinStreak = 0;
            }
            currentLossStreak++;
            maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
            totalLosses++;
            totalLossAmount += Math.abs(trade.tradeResult);
        }

        // Store the drawdown value for later use in the trade list
        trade.currentDrawdown = drawdown;
    });

    // Add final streak to arrays
    if (currentWinStreak > 0) winStreaks.push(currentWinStreak);
    if (currentLossStreak > 0) lossStreaks.push(currentLossStreak);

    // Calculate averages
    const avgDrawdown = totalDrawdown / trades.length;
    const avgWinStreak = winStreaks.length > 0 ? winStreaks.reduce((a, b) => a + b, 0) / winStreaks.length : 0;
    const avgLossStreak = lossStreaks.length > 0 ? lossStreaks.reduce((a, b) => a + b, 0) / lossStreaks.length : 0;
    const profitFactor = totalLossAmount !== 0 ? Math.abs(totalWinAmount / totalLossAmount) : totalWinAmount > 0 ? Infinity : 0;

    // Update UI with all statistics
    document.getElementById('tradeDetailsTitle').textContent = `${title} - Trade Details`;
    document.getElementById('modalInitialBalance').textContent = formatCurrency(initialBalance);
    
    const finalBalanceEl = document.getElementById('modalFinalBalance');
    finalBalanceEl.textContent = formatCurrency(finalBalance);
    finalBalanceEl.className = finalBalance >= initialBalance ? 'value-colored positive-value' : 'value-colored negative-value';
    
    const totalReturnEl = document.getElementById('modalTotalReturn');
    totalReturnEl.textContent = formatPercentage(totalReturn);
    totalReturnEl.className = totalReturn >= 0 ? 'value-colored positive-value' : 'value-colored negative-value';
    
    const tradeProfitEl = document.getElementById('modalExpectedProfit');
    const profit = finalBalance - initialBalance;
    tradeProfitEl.textContent = formatCurrency(profit);
    tradeProfitEl.className = profit >= 0 ? 'value-colored positive-value' : 'value-colored negative-value';
    
    document.getElementById('modalTotalCommission').textContent = formatCurrency(totalCommission);
    document.getElementById('modalMaxDrawdown').textContent = formatPercentage(maxDrawdown);
    document.getElementById('modalAvgDrawdown').textContent = formatPercentage(avgDrawdown);
    const profitFactorEl = document.getElementById('modalProfitFactor');
    profitFactorEl.textContent = profitFactor.toFixed(2);
    profitFactorEl.className = profitFactor >= 1 ? 'value-colored positive-value' : 'value-colored negative-value';
    document.getElementById('modalBestTrade').textContent = formatCurrency(bestTrade);
    document.getElementById('modalWorstTrade').textContent = formatCurrency(worstTrade);
    document.getElementById('modalMaxWinsRow').textContent = maxWinStreak;
    document.getElementById('modalMaxLossesRow').textContent = maxLossStreak;
    document.getElementById('modalAvgWinStreak').textContent = avgWinStreak.toFixed(1);
    document.getElementById('modalAvgLossStreak').textContent = avgLossStreak.toFixed(1);

    // Arrays to store values for charts
    const returns = [0];
    const drawdowns = [0];

    // Create trade list and collect chart data
    const tradeList = document.getElementById('tradeList');
    tradeList.innerHTML = '';

    trades.forEach(trade => {
        // Add values to chart arrays
        const tradeReturn = ((trade.endBalance - initialBalance) / initialBalance) * 100;
        returns.push(tradeReturn);
        drawdowns.push(trade.currentDrawdown);

        const tradeEl = document.createElement('div');
        tradeEl.className = 'trade-item';
        tradeEl.innerHTML = `
            <div class="trade-number">#${trade.tradeNumber}</div>
            <div class="${trade.isWin ? 'trade-win' : 'trade-loss'}">
                ${formatCurrency(trade.tradeResult)}
            </div>
            <div>Balance: ${formatCurrency(trade.endBalance)}</div>
            <div class="trade-commission">Commission: ${formatCurrency(trade.commission)}</div>
            <div class="trade-drawdown">Drawdown: <strong class="${trade.currentDrawdown === 0 ? 'positive-value' : 'negative-value'}">${trade.currentDrawdown.toFixed(2)}%</strong></div>
            <div class="trade-return">Total Return: <strong class="${tradeReturn >= 0 ? 'positive-value' : 'negative-value'}">${tradeReturn.toFixed(2)}%</strong></div>
        `;
        tradeList.appendChild(tradeEl);
    });

    // Update charts with the collected data
    updateBalanceChart(returns);
    updateDrawdownChart(drawdowns);
}

function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

function formatPercentage(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    }).format(value / 100);
}

function updateChart(finalBalances, initialBalance) {
    // Prepare data for histogram
    const binSize = (Math.max(...finalBalances) - Math.min(...finalBalances)) / 30;
    const bins = {};
    
    finalBalances.forEach(balance => {
        const binIndex = Math.floor(balance / binSize);
        bins[binIndex] = (bins[binIndex] || 0) + 1;
    });

    const labels = Object.keys(bins).map(bin => formatCurrency(bin * binSize));
    const data = Object.values(bins);

    // Destroy existing chart if it exists
    if (balanceChart) {
        balanceChart.destroy();
    }

    // Create new chart
    const ctx = document.getElementById('balanceChart').getContext('2d');
    balanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Distribution of Final Balances',
                data: data,
                backgroundColor: 'rgba(37, 99, 235, 0.5)',
                borderColor: 'rgba(37, 99, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Distribution of Possible Outcomes',
                    color: '#e2e8f0',
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Frequency: ${context.raw}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Frequency',
                        color: '#e2e8f0'
                    },
                    grid: {
                        color: 'rgba(45, 55, 72, 0.5)'
                    },
                    ticks: {
                        color: '#9ca3af'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Final Balance',
                        color: '#e2e8f0'
                    },
                    grid: {
                        color: 'rgba(45, 55, 72, 0.5)'
                    },
                    ticks: {
                        color: '#9ca3af',
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            }
        }
    });
}

function generateBalanceProgression(initialBalance, riskAmount, rewardAmount, winRate, numberOfTrades) {
    let balance = initialBalance;
    const balances = [balance];
    
    for (let i = 0; i < numberOfTrades; i++) {
        // Simulate trade outcome based on win rate
        if (Math.random() < winRate) {
            balance += rewardAmount;
        } else {
            balance -= riskAmount;
        }
        balances.push(balance);
    }
    
    return balances;
}

function validateInputs(balance, risk, winRate, plRatio, trades) {
    if (isNaN(balance) || balance <= 0) return false;
    if (isNaN(risk) || risk <= 0 || risk > 1) return false;
    if (isNaN(winRate) || winRate < 0 || winRate > 1) return false;
    if (isNaN(plRatio) || plRatio <= 0) return false;
    if (isNaN(trades) || trades <= 0) return false;
    return true;
}

function updateBalanceChart(returns) {
    const ctx = document.getElementById('balanceDrawdownChart').getContext('2d');
    
    if (balanceDrawdownChart) {
        balanceDrawdownChart.destroy();
    }
    
    const labels = Array.from({ length: returns.length }, (_, i) => i);
    
    balanceDrawdownChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Return %',
                data: returns,
                borderColor: '#00b341',
                backgroundColor: 'rgba(0, 179, 65, 0.1)',
                fill: true,
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Trade Number',
                        color: '#e2e8f0'
                    },
                    grid: {
                        color: 'rgba(45, 55, 72, 0.5)'
                    },
                    ticks: {
                        color: '#9ca3af'
                    }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Return %',
                        color: '#e2e8f0'
                    },
                    grid: {
                        color: 'rgba(45, 55, 72, 0.5)'
                    },
                    ticks: {
                        color: '#9ca3af',
                        callback: function(value) {
                            return value.toFixed(1) + '%';
                        }
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Total Return Progression',
                    color: '#e2e8f0',
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'Return: ' + context.raw.toFixed(2) + '%';
                        }
                    }
                }
            }
        }
    });
}

function updateDrawdownChart(drawdowns) {
    const ctx = document.getElementById('drawdownChart').getContext('2d');
    
    if (drawdownChart) {
        drawdownChart.destroy();
    }
    
    const labels = Array.from({ length: drawdowns.length }, (_, i) => i);
    const maxDrawdown = Math.max(...drawdowns);
    const yAxisMax = Math.max(5, Math.ceil(maxDrawdown * 1.2)); // At least 5% or 20% above max
    
    drawdownChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Drawdown',
                    data: drawdowns,
                    borderColor: '#ff4444',
                    backgroundColor: 'rgba(255, 68, 68, 0.1)',
                    fill: true,
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Trade Number',
                        color: '#e2e8f0'
                    },
                    grid: {
                        color: 'rgba(45, 55, 72, 0.5)'
                    },
                    ticks: {
                        color: '#9ca3af',
                        maxTicksLimit: 10
                    }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Drawdown %',
                        color: '#e2e8f0'
                    },
                    grid: {
                        color: 'rgba(45, 55, 72, 0.5)'
                    },
                    ticks: {
                        color: '#9ca3af',
                        callback: function(value) {
                            return value.toFixed(1) + '%';
                        }
                    },
                    min: 0,
                    max: yAxisMax,
                    suggestedMax: 5 // Show at least 5% on the scale
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Drawdown Progression',
                    color: '#e2e8f0',
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                legend: {
                    labels: {
                        color: '#e2e8f0'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'Drawdown: ' + context.raw.toFixed(2) + '%';
                        }
                    }
                }
            }
        }
    });
}

// Contact bubble functionality
document.addEventListener('DOMContentLoaded', function() {
    const contactBubble = document.getElementById('contactBubble');
    const popup = document.getElementById('contactPopup');

    contactBubble.addEventListener('click', function(e) {
        e.stopPropagation();
        popup.classList.toggle('show');
    });

    document.addEventListener('click', function(e) {
        if (!contactBubble.contains(e.target)) {
            popup.classList.remove('show');
        }
    });
});
