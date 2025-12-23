let balanceChart = null;
let balanceDrawdownChart = null;
let drawdownChart = null;
let simulationTradeHistory = [];
let isCompounding = true;

function runMonteCarloSimulation(initialBalance, riskPerTrade, winRate, profitLossRatio, numberOfTrades, commissionPercent, numSimulations) {
    const results = [];
    simulationTradeHistory = [];
    const riskType = document.getElementById('riskType').value;
    const isCompoundingValue = isCompounding;
    
    for (let sim = 0; sim < numSimulations; sim++) {
        let balance = initialBalance;
        const trades = [];
        let riskAmount;
        
        if (riskType === 'percent') {
            riskAmount = initialBalance * (riskPerTrade / 100);
        } else {
            riskAmount = riskPerTrade;
        }
        
        for (let trade = 0; trade < numberOfTrades; trade++) {
            let currentRiskAmount = riskAmount;
            if (isCompoundingValue && riskType === 'percent') {
                currentRiskAmount = balance * (riskPerTrade / 100);
            }
            const commission = balance * (commissionPercent / 100);
            
            // Subtract commission
            balance -= commission;
            
            let tradeResult;
            if (Math.random() * 100 < winRate) {
                tradeResult = currentRiskAmount * profitLossRatio;
                balance += tradeResult;
            } else {
                tradeResult = -currentRiskAmount;
                balance += tradeResult;
            }
            
            trades.push({
                tradeNumber: trade + 1,
                isWin: tradeResult > 0,
                startBalance: balance - tradeResult,
                endBalance: balance,
                riskAmount: currentRiskAmount,
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

function calculateAdvancedMetrics(trades, initialBalance) {
    // Calculate daily returns for risk metrics
    const returns = trades.map((trade, index) => {
        const prevBalance = index === 0 ? initialBalance : trades[index - 1].endBalance;
        return (trade.endBalance - prevBalance) / prevBalance;
    });

    // Risk-free rate (assuming 2% annual)
    const riskFreeDaily = 0.02 / 252;

    // Sharpe Ratio calculation
    const excessReturns = returns.map(r => r - riskFreeDaily);
    const avgExcessReturn = excessReturns.reduce((a, b) => a + b, 0) / excessReturns.length;
    const stdDev = Math.sqrt(
        excessReturns.reduce((sum, r) => sum + Math.pow(r - avgExcessReturn, 2), 0) / excessReturns.length
    );
    const sharpeRatio = (avgExcessReturn / stdDev) * Math.sqrt(252);

    // Sortino Ratio calculation
    const downside = excessReturns.filter(r => r < 0);
    const downsideDeviation = Math.sqrt(
        downside.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downside.length || 1
    );
    const sortinoRatio = (avgExcessReturn / downsideDeviation) * Math.sqrt(252);

    // Drawdown calculations
    let peak = initialBalance;
    let maxDrawdown = 0;
    let currentDrawdown = null;
    let drawdowns = [];
    let underwaterPeriods = 0;
    let recoveryTrades = 0;
    let valleyToPeakTrades = 0;

    trades.forEach((trade, index) => {
        const balance = trade.endBalance;

        if (balance >= peak) {
            peak = balance;
            if (currentDrawdown) {
                currentDrawdown.recoveryTrades = index - currentDrawdown.startIndex;
                valleyToPeakTrades += currentDrawdown.recoveryTrades;
                drawdowns.push(currentDrawdown);
                currentDrawdown = null;
            }
        } else {
            underwaterPeriods++;
            const drawdownPercent = (peak - balance) / peak * 100;
            if (!currentDrawdown) {
                currentDrawdown = {
                    startIndex: index,
                    maxDrawdown: drawdownPercent,
                    recoveryTrades: 0
                };
            } else if (drawdownPercent > currentDrawdown.maxDrawdown) {
                currentDrawdown.maxDrawdown = drawdownPercent;
            }
            maxDrawdown = Math.max(maxDrawdown, drawdownPercent);
        }
    });

    // R-Multiple and Position Impact calculations
    const rMultiples = trades.map(trade => {
        const riskAmount = trade.riskAmount;
        return trade.tradeResult / riskAmount;
    });

    const avgRMultiple = rMultiples.reduce((a, b) => a + b, 0) / rMultiples.length;
    
    // Position Impact (ratio of actual returns to equal-sized position returns)
    const equalSizedReturns = trades.map(trade => trade.tradeResult / trade.startBalance);
    const actualReturns = trades.map(trade => (trade.endBalance - trade.startBalance) / trade.startBalance);
    const positionImpact = actualReturns.reduce((a, b) => a + b, 0) / equalSizedReturns.reduce((a, b) => a + b, 0);

    // Calmar Ratio calculation (using annualized return)
    const totalReturn = (trades[trades.length - 1].endBalance - initialBalance) / initialBalance;
    const annualizedReturn = (Math.pow(1 + totalReturn, 252 / trades.length) - 1) * 100;
    const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

    return {
        sharpeRatio: sharpeRatio.toFixed(2),
        sortinoRatio: sortinoRatio.toFixed(2),
        calmarRatio: calmarRatio.toFixed(2),
        maxDrawdown: maxDrawdown.toFixed(2),
        avgDrawdown: (drawdowns.reduce((sum, d) => sum + d.maxDrawdown, 0) / drawdowns.length || 0).toFixed(2),
        recoveryTime: (recoveryTrades / drawdowns.length || 0).toFixed(1),
        underwaterTime: ((underwaterPeriods / trades.length) * 100).toFixed(1),
        valleyToPeak: (valleyToPeakTrades / drawdowns.length || 0).toFixed(1),
        rMultiple: avgRMultiple.toFixed(2),
        positionImpact: positionImpact.toFixed(2)
    };
}

function getMetricColor(metric, value) {
    const colorRanges = {
        'sharpeRatio': [
            { threshold: 3, color: 'excellent-value' },
            { threshold: 2, color: 'very-good-value' },
            { threshold: 1, color: 'good-value' },
            { threshold: -Infinity, color: 'poor-value' }
        ],
        'sortinoRatio': [
            { threshold: 3, color: 'excellent-value' },
            { threshold: 2, color: 'very-good-value' },
            { threshold: 1, color: 'good-value' },
            { threshold: -Infinity, color: 'poor-value' }
        ],
        'calmarRatio': [
            { threshold: 3, color: 'excellent-value' },
            { threshold: 2, color: 'very-good-value' },
            { threshold: 1, color: 'good-value' },
            { threshold: -Infinity, color: 'poor-value' }
        ],
        'rMultiple': [
            { threshold: 2, color: 'excellent-value' },
            { threshold: 1.5, color: 'very-good-value' },
            { threshold: 1, color: 'good-value' },
            { threshold: -Infinity, color: 'poor-value' }
        ],
        'maxDrawdown': [
            { threshold: 5, color: 'excellent-value' },
            { threshold: 10, color: 'very-good-value' },
            { threshold: 20, color: 'good-value' },
            { threshold: Infinity, color: 'poor-value' }
        ],
        'positionImpact': [
            { threshold: 1.5, color: 'excellent-value' },
            { threshold: 1.2, color: 'very-good-value' },
            { threshold: 1, color: 'good-value' },
            { threshold: -Infinity, color: 'poor-value' }
        ]
    };

    if (!colorRanges[metric]) return '';
    
    const ranges = colorRanges[metric];
    // For metrics where lower is better (like maxDrawdown), reverse the comparison
    const isInverse = metric === 'maxDrawdown';
    const numValue = parseFloat(value);

    for (const range of ranges) {
        if (isInverse ? numValue <= range.threshold : numValue >= range.threshold) {
            return range.color;
        }
    }
    return '';
}

/**
 * Calculates the Kelly Criterion percentage and provides position sizing recommendations
 * 
 * The Kelly Formula is: K% = (W * R - L) / R
 * Where:
 * - W is win rate (e.g., 0.65 for 65%)
 * - R is reward/risk ratio (e.g., 2 means you make $2 for every $1 risked)
 * - L is loss rate (1 - W, e.g., 0.35 for 35%)
 * 
 * Example:
 * With 65% win rate and 2:1 reward/risk:
 * K% = (0.65 * 2 - 0.35) / 2 = 0.475 or 47.5%
 * 
 * Full Kelly: 47.5% (very aggressive)
 * Half Kelly: 23.75% (balanced)
 * Quarter Kelly: 11.875% (conservative)
 * 
 * @param {number} winRate - Win rate as decimal (e.g., 0.65 for 65%)
 * @param {number} rewardRiskRatio - Reward to risk ratio (e.g., 2 for 2:1)
 * @returns {Object} Kelly percentages and recommendations
 */
function calculateKellyCriterion(winRate, rewardRiskRatio) {
    // Convert win rate from percentage to decimal
    winRate = winRate / 100;
    
    // Calculate loss rate (complement of win rate)
    const lossRate = 1 - winRate;
    
    // Calculate full Kelly percentage
    // Formula: (win_rate * reward_risk_ratio - loss_rate) / reward_risk_ratio
    const fullKelly = ((winRate * rewardRiskRatio - lossRate) / rewardRiskRatio) * 100;
    
    // Calculate expected value per trade
    // Formula: (win_rate * reward) - (loss_rate * risk)
    // For $1 risk, reward = rewardRiskRatio * $1
    const expectedValue = (winRate * rewardRiskRatio) - lossRate;

    // Calculate conservative position sizes
    const halfKelly = fullKelly / 2;
    const quarterKelly = fullKelly / 4;

    // Calculate recommendation based on Kelly percentage
    const recommendation = getKellyRecommendation(fullKelly, expectedValue);

    return {
        fullKelly: Math.max(0, fullKelly).toFixed(2),
        halfKelly: Math.max(0, halfKelly).toFixed(2),
        quarterKelly: Math.max(0, quarterKelly).toFixed(2),
        expectedValue: expectedValue.toFixed(4),
        recommendation: recommendation
    };
}

/**
 * Determines the appropriate Kelly recommendation based on risk levels
 * 
 * Risk Level Guidelines:
 * - High Risk (Full Kelly > 25%): Very aggressive, use Quarter Kelly
 * - Medium Risk (Full Kelly 15-25%): Good potential, use Half Kelly
 * - Low Risk (Full Kelly < 15%): Conservative, can use up to Half Kelly
 * 
 * These thresholds are based on common trading wisdom:
 * - Most professional traders never risk more than 2-3% per trade
 * - Even great strategies rarely have Full Kelly above 25%
 * - Higher Kelly % means higher returns but also higher volatility
 */
function getKellyRecommendation(fullKelly, expectedValue) {
    // Add absolute maximum recommended risk
    const MAX_RECOMMENDED_RISK = 5; // 5% maximum recommended risk per trade
    
    let recommendation = '';
    
    if (expectedValue <= 0) {
        recommendation = '⚠️ Strategy has negative expected value - Not recommended';
    } else if (fullKelly > 25) {
        recommendation = `⚠️ Very high risk detected - Recommended to use no more than ${MAX_RECOMMENDED_RISK}% risk per trade regardless of Kelly percentage`;
    } else if (fullKelly > 15) {
        recommendation = '⚠️ High potential but risky - Use Conservative (Quarter Kelly)';
    } else if (fullKelly > 5) {
        recommendation = '✓ Good potential - Consider using Half Kelly';
    } else {
        recommendation = '⚡ Low edge - Consider improving win rate or reward/risk ratio';
    }
    
    return recommendation;
}

function calculateResults() {
    // Track calculation event
    gtag('event', 'calculate_probability', {
        'event_category': 'Calculator',
        'event_label': 'Calculate Button Click'
    });
    
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

    // Update the analysis
    updateTradeAnalysis({
        initialBalance: document.getElementById('accountBalance').value,
        expectedProfit: document.getElementById('expectedProfit').textContent,
        roi: document.getElementById('roi').textContent,
        totalCommission: document.getElementById('totalCommission').textContent,
        maxDrawdown: document.getElementById('modalMaxDrawdown').textContent,
        sharpeRatio: document.getElementById('modalSharpeRatio').textContent,
        sortinoRatio: document.getElementById('modalSortinoRatio').textContent,
        calmarRatio: document.getElementById('modalCalmarRatio').textContent,
        profitFactor: document.getElementById('modalProfitFactor').textContent,
        bestTrade: document.getElementById('modalBestTrade').textContent,
        worstTrade: document.getElementById('modalWorstTrade').textContent,
        rMultiple: document.getElementById('modalRMultiple').textContent,
        winRate: document.getElementById('winRate').value,
        maxConsecutiveWins: document.getElementById('modalMaxWinsRow').textContent,
        maxConsecutiveLosses: document.getElementById('modalMaxLossesRow').textContent,
        avgWinStreak: document.getElementById('modalAvgWinStreak').textContent,
        avgLossStreak: document.getElementById('modalAvgLossStreak').textContent,
        kellyPercentage: document.getElementById('kellyFull').textContent.replace('%', ''),
        underwaterTime: document.getElementById('modalUnderwaterTime').textContent
    });
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

    const advancedMetrics = calculateAdvancedMetrics(trades, initialBalance);

    const kellyResults = calculateKellyCriterion(parseFloat(document.getElementById('winRate').value), parseFloat(document.getElementById('profitLossRatio').value));

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
    document.getElementById('modalSharpeRatio').textContent = advancedMetrics.sharpeRatio;
    document.getElementById('modalSortinoRatio').textContent = advancedMetrics.sortinoRatio;
    document.getElementById('modalCalmarRatio').textContent = advancedMetrics.calmarRatio;
    document.getElementById('modalRMultiple').textContent = advancedMetrics.rMultiple;
    document.getElementById('modalPositionImpact').textContent = advancedMetrics.positionImpact;
    document.getElementById('modalMaxDrawdown').textContent = advancedMetrics.maxDrawdown + '%';
    document.getElementById('modalAvgDrawdown').textContent = advancedMetrics.avgDrawdown + '%';
    document.getElementById('modalRecoveryTime').textContent = advancedMetrics.recoveryTime;
    document.getElementById('modalUnderwaterTime').textContent = advancedMetrics.underwaterTime + '%';
    document.getElementById('modalValleyToPeak').textContent = advancedMetrics.valleyToPeak;

    // Update metrics with Kelly calculations
    document.getElementById('kellyFull').textContent = kellyResults.fullKelly + '%';
    document.getElementById('kellyHalf').textContent = kellyResults.halfKelly + '%';
    document.getElementById('kellyQuarter').textContent = kellyResults.quarterKelly + '%';
    document.getElementById('kellyExpectedValue').textContent = kellyResults.expectedValue;
    
    const recommendationEl = document.getElementById('kellyRecommendation');
    if (recommendationEl) {
        recommendationEl.textContent = kellyResults.recommendation;
        recommendationEl.className = `kelly-${kellyResults.recommendation.riskLevel}`;
        recommendationEl.title = kellyResults.recommendation.suggestion;
    }

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
        tradeEl.className = `trade-item ${trade.isWin ? 'win' : 'loss'}`;
        tradeEl.innerHTML = `
            <div class="trade-details">
                <span class="trade-number">#${trade.tradeNumber}</span>
                <span class="trade-result ${trade.isWin ? 'win' : 'loss'}">${trade.isWin ? 'Win' : 'Loss'}</span>
                <div class="trade-info">
                    <span class="trade-amount">${formatCurrency(trade.tradeResult)}</span>
                </div>
            </div>
            <span class="trade-commission">Commission: ${formatCurrency(trade.commission)}</span>
        `;
        tradeList.appendChild(tradeEl);
    });

    // Update metrics with color coding
    const metricsToColor = {
        'modalSharpeRatio': 'sharpeRatio',
        'modalSortinoRatio': 'sortinoRatio',
        'modalCalmarRatio': 'calmarRatio',
        'modalRMultiple': 'rMultiple',
        'modalMaxDrawdown': 'maxDrawdown',
        'modalPositionImpact': 'positionImpact'
    };

    for (const [elementId, metricType] of Object.entries(metricsToColor)) {
        const element = document.getElementById(elementId);
        const value = element.textContent;
        // Remove any existing color classes
        element.className = 'value-colored';
        // Add new color class
        element.classList.add(getMetricColor(metricType, value));
    }

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
    // Track chart update event
    gtag('event', 'update_chart', {
        'event_category': 'Visualization',
        'event_label': 'Chart Update'
    });
    
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

function toggleCompounding() {
    const button = document.querySelector('.toggle-button');
    
    isCompounding = !isCompounding;
    
    if (isCompounding) {
        button.textContent = 'Compounding';
        button.classList.add('active');
    } else {
        button.textContent = 'Not Compounding';
        button.classList.remove('active');
    }
}

// Add event listener for toggle
document.addEventListener('DOMContentLoaded', function() {
    const button = document.querySelector('.toggle-button');
    button.addEventListener('click', toggleCompounding);
});

// Contact popup functionality
document.addEventListener('DOMContentLoaded', function() {
    const contactIcon = document.querySelector('.contact-icon');
    const contactPopup = document.querySelector('.contact-popup');
    let isPopupVisible = false;

    contactIcon.addEventListener('click', function(e) {
        e.stopPropagation();
        isPopupVisible = !isPopupVisible;
        contactPopup.classList.toggle('show');
    });

    // Close popup when clicking outside
    document.addEventListener('click', function(e) {
        if (isPopupVisible && !contactPopup.contains(e.target)) {
            isPopupVisible = false;
            contactPopup.classList.remove('show');
        }
    });
});

function updateTradeAnalysis(results) {
    // Monte Carlo Analysis
    const simCount = document.getElementById('simulations').value;
    const bestCase = document.getElementById('bestCase').textContent;
    const avgCase = document.getElementById('averageCase').textContent;
    const worstCase = document.getElementById('worstCase').textContent;
    const profitProb = document.getElementById('profitProb').textContent;

    let monteCarloText = `Based on ${simCount} Monte Carlo simulations of your strategy:\n\n`;
    monteCarloText += `• Average Return: ${avgCase} - This is your most likely outcome over time\n`;
    monteCarloText += `• Best Case: ${bestCase} - Achieved in ${Math.round(100/simCount)}% of simulations\n`;
    monteCarloText += `• Worst Case: ${worstCase} - Your maximum downside risk\n\n`;
    monteCarloText += `${profitProb} of all simulations were profitable, which ${parseFloat(profitProb) > 70 ? 
        "indicates a robust strategy" : parseFloat(profitProb) > 50 ? 
        "shows promise but could be improved" : "suggests the strategy needs significant refinement"}.\n\n`;
    monteCarloText += `<div class="note">💡 Tip: A reliable strategy should be profitable in at least 70% of simulations.</div>`;
    
    // Balance Analysis
    let balanceText = `Starting with $${results.initialBalance}, your strategy shows:\n\n`;
    balanceText += `• Current Profit: ${results.expectedProfit} (${results.roi} return)\n`;
    balanceText += `• Commission Impact: ${results.totalCommission} (${((parseFloat(results.totalCommission.replace(/[^0-9.-]+/g, "")) / 
        parseFloat(results.expectedProfit.replace(/[^0-9.-]+/g, ""))) * 100).toFixed(1)}% of profits)\n\n`;
    
    const commissionImpact = parseFloat(results.totalCommission.replace(/[^0-9.-]+/g, "")) / 
        parseFloat(results.expectedProfit.replace(/[^0-9.-]+/g, ""));
    balanceText += commissionImpact > 0.1 ? 
        "<span class='warning'>⚠️ Commission costs are significantly impacting profitability. Consider reducing trade frequency.</span>" : 
        "<span class='success'>✅ Commission costs are well-managed relative to profits.</span>";
    
    // Risk Analysis
    let riskText = `Your risk metrics indicate:\n\n`;
    riskText += `• Maximum Drawdown: ${results.maxDrawdown} - ${
        parseFloat(results.maxDrawdown) > 20 ? "⚠️ Concerning level, needs attention" : 
        parseFloat(results.maxDrawdown) > 10 ? "⚠️ Moderate, could be improved" : 
        "✅ Well-controlled"}\n`;
    riskText += `• Sharpe Ratio: ${results.sharpeRatio} - ${
        parseFloat(results.sharpeRatio) > 2 ? "✅ Excellent risk-adjusted returns" : 
        parseFloat(results.sharpeRatio) > 1 ? "✓ Good risk-adjusted returns" : 
        "⚠️ Poor risk-adjusted returns"}\n`;
    riskText += `• Sortino Ratio: ${results.sortinoRatio} - ${
        parseFloat(results.sortinoRatio) > 2 ? "✅ Strong downside risk management" : 
        parseFloat(results.sortinoRatio) > 1 ? "✓ Acceptable downside risk" : 
        "⚠️ High downside risk"}\n`;
    riskText += `• Calmar Ratio: ${results.calmarRatio} - ${
        parseFloat(results.calmarRatio) > 5 ? "✅ Exceptional return relative to risk" : 
        parseFloat(results.calmarRatio) > 2 ? "✓ Good return relative to risk" : 
        "⚠️ Poor return relative to risk"}\n\n`;
    riskText += `<div class="note">💡 Your strategy's risk-adjusted performance is ${
        (parseFloat(results.sharpeRatio) + parseFloat(results.calmarRatio))/2 > 3 ? "excellent" : 
        (parseFloat(results.sharpeRatio) + parseFloat(results.calmarRatio))/2 > 1.5 ? "good" : "needs improvement"}.</div>`;
    
    // Performance Analysis
    let performanceText = `Performance metrics show:\n\n`;
    performanceText += `• Profit Factor: ${results.profitFactor} - ${
        parseFloat(results.profitFactor) > 2 ? "✅ Very strong profitability" : 
        parseFloat(results.profitFactor) > 1.5 ? "✓ Good profitability" : 
        "⚠️ Marginal profitability"}\n`;
    performanceText += `• Best Trade: ${results.bestTrade}\n`;
    performanceText += `• Worst Trade: ${results.worstTrade}\n`;
    performanceText += `• R-Multiple: ${results.rMultiple} - You're making ${results.rMultiple}× your risk per trade\n\n`;
    performanceText += `<div class="note">💡 ${parseFloat(results.profitFactor) < 1.5 ? 
        "Consider increasing your reward-to-risk ratio or improving win rate" : 
        "Your strategy shows good profit potential"}</div>`;
    
    // Trading Psychology
    let psychologyText = `Psychological factors to consider:\n\n`;
    psychologyText += `• Win Rate: ${results.winRate}% - ${
        parseFloat(results.winRate) > 65 ? "Excellent but beware of overconfidence" : 
        parseFloat(results.winRate) > 50 ? "Solid performance" : 
        "Needs improvement"}\n`;
    psychologyText += `• Longest Win Streak: ${results.maxConsecutiveWins} trades\n`;
    psychologyText += `• Longest Loss Streak: ${results.maxConsecutiveLosses} trades\n`;
    psychologyText += `• Average Win Streak: ${results.avgWinStreak} trades\n`;
    psychologyText += `• Average Loss Streak: ${results.avgLossStreak} trades\n\n`;
    psychologyText += `<div class="note">💡 Can you maintain discipline during a ${results.maxConsecutiveLosses}-trade losing streak? This is crucial for success.</div>`;
    
    // Position Sizing
    let positionText = `Based on the Kelly Criterion:\n\n`;
    positionText += `• Full Kelly (Aggressive): ${results.kellyPercentage}% per trade\n`;
    positionText += `• Half Kelly (Balanced): ${(parseFloat(results.kellyPercentage)/2).toFixed(2)}% per trade\n`;
    positionText += `• Quarter Kelly (Conservative): ${(parseFloat(results.kellyPercentage)/4).toFixed(2)}% per trade\n\n`;
    
    const quarterKelly = parseFloat(results.kellyPercentage)/4;
    positionText += `Recommended Quarter Kelly position sizes:\n`;
    positionText += `• $10,000 account: Risk $${(10000 * quarterKelly/100).toFixed(2)} per trade\n`;
    positionText += `• $25,000 account: Risk $${(25000 * quarterKelly/100).toFixed(2)} per trade\n`;
    positionText += `• $50,000 account: Risk $${(50000 * quarterKelly/100).toFixed(2)} per trade\n\n`;
    
    positionText += `<div class="note">💡 Risk Management Guidelines:\n`;
    positionText += `• New Traders: Start with 1% risk maximum while learning (e.g., $100 per trade on a $10,000 account)\n`;
    positionText += `• Prop Firm Accounts: Keep risk at 0.5% or lower to maintain account safety\n`;
    positionText += `• Experienced Traders: Can gradually increase to 1-2% after proving consistent profitability\n`;
    positionText += `• Never exceed Quarter Kelly size regardless of experience level</div>\n\n`;
    
    positionText += `<div class="warning">${parseFloat(results.kellyPercentage) > 20 ? 
        "⚠️ High Kelly percentage detected - stick to conservative position sizes until strategy is proven over 100+ trades" : 
        "✅ Reasonable Kelly percentage - maintain disciplined position sizing for consistent growth"}</div>`;
    
    // Strategy Improvements
    let improvementsText = `Key areas for strategy optimization:\n\n`;
    let improvements = [];
    
    if (parseFloat(results.maxDrawdown) > 15) {
        improvements.push("📉 <strong>Reduce Maximum Drawdown:</strong> Consider tighter stops or smaller position sizes");
    }
    if (parseFloat(results.underwaterTime) > 70) {
        improvements.push("⏳ <strong>Reduce Underwater Time:</strong> Look for better entry/exit criteria");
    }
    if (parseFloat(results.profitFactor) < 1.5) {
        improvements.push("💰 <strong>Improve Profit Factor:</strong> Focus on better reward:risk ratios");
    }
    if (parseFloat(results.sharpeRatio) < 1.5) {
        improvements.push("📊 <strong>Enhance Risk-Adjusted Returns:</strong> Reduce volatility while maintaining returns");
    }
    if (parseFloat(results.winRate) < 50) {
        improvements.push("🎯 <strong>Increase Win Rate:</strong> Refine entry criteria and trade selection");
    }
    
    improvementsText += improvements.length > 0 ? improvements.join("\n\n") : "✅ Your strategy is well-optimized! Focus on consistent execution.";
    improvementsText += `\n\n<div class="note">💡 Remember: The best strategy is one you can execute consistently with confidence.</div>`;

    // Update the DOM
    document.getElementById('monteCarloAnalysis').innerHTML = monteCarloText;
    document.getElementById('balanceAnalysis').innerHTML = balanceText;
    document.getElementById('riskAnalysis').innerHTML = riskText;
    document.getElementById('performanceAnalysis').innerHTML = performanceText;
    document.getElementById('psychologyAnalysis').innerHTML = psychologyText;
    document.getElementById('positionSizingAnalysis').innerHTML = positionText;
    document.getElementById('improvementsAnalysis').innerHTML = improvementsText;
}
