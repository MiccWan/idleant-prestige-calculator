import { Decimal } from "decimal.js";
import { formatDuration, intervalToDuration } from 'date-fns';
import type { Cost } from "./model/cost";
import { GameModel } from "./model/gameModel";
import { Action, BuyAction } from "./model/units/action";
import type { Unit } from "./model/units/unit";
import { Utils } from "./model/utils";

// Required for large number calculations
Decimal.set({ precision: 100 });

class Goal {
  name: string = "";
  twinRequired: Decimal = new Decimal(0);
  twinTotal: Decimal = new Decimal(0);
  twinTime: Decimal = new Decimal(Number.POSITIVE_INFINITY);
  buyRequired: Decimal = new Decimal(0);
  buyTotal: Decimal = new Decimal(0);
  buyTime: Decimal = new Decimal(Number.POSITIVE_INFINITY);

  get timeToPrestige(): Decimal {
    return Decimal.max(this.twinTime, this.buyTime);
  }
}

interface PrestigeResults {
  goals: Goal[];
  timeToPrestige: Decimal;
}

class IdleAntCalculator {
  private saveDataTextarea: HTMLTextAreaElement;
  private calculateBtn: HTMLButtonElement;
  private resultsSection: HTMLElement;
  private prestigeTime: HTMLElement;
  private bottleneck: HTMLElement;
  private recommendations: HTMLElement;

  constructor() {
    this.initializeElements();
    this.bindEvents();
    this.loadSaveData();
  }

  private initializeElements(): void {
    this.saveDataTextarea = document.getElementById('saveData') as HTMLTextAreaElement;
    this.calculateBtn = document.getElementById('calculateBtn') as HTMLButtonElement;
    this.resultsSection = document.getElementById('results') as HTMLElement;
    this.prestigeTime = document.getElementById('prestigeTime') as HTMLElement;
    this.bottleneck = document.getElementById('bottleneck') as HTMLElement;
    this.recommendations = document.getElementById('recommendations') as HTMLElement;
  }

  private bindEvents(): void {
    this.calculateBtn.addEventListener('click', () => this.calculatePrestige());

    // Allow Enter key to calculate (Ctrl+Enter for new line)
    this.saveDataTextarea.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.ctrlKey) {
        e.preventDefault();
        this.calculatePrestige();
      }
    });
  }

  private loadSaveData(): void {
    const saveData = localStorage.getItem('saveData');
    if (saveData) {
      this.saveDataTextarea.value = saveData;
      this.calculatePrestige();
    }
  }

  private calculatePrestige(): void {
    const saveData = this.saveDataTextarea.value.trim();

    if (!saveData) {
      alert('Please paste your Idle Ant save data first!');
      return;
    }

    // Show loading state
    this.calculateBtn.textContent = 'Parsing...';
    this.calculateBtn.disabled = true;

    try {
      // Parse the save data
      const parsedData = this.parseSaveData(saveData);

      // Calculate prestige timing
      const results = this.calculatePrestigeTiming(parsedData);

      // Display results
      this.displayResults(results);

      localStorage.setItem('saveData', saveData);
    } catch (error) {
      console.error(new Error('Error calculating prestige:', { cause: error }));
      // alert(`Error: ${(error as Error).message}`);
    } finally {
      // Reset button state
      this.calculateBtn.textContent = 'Calculate Prestige Time';
      this.calculateBtn.disabled = false;
    }
  }

  private parseSaveData(saveData: string): GameModel {
    try {
      const game = new GameModel();
      game.load(saveData);
      game.all.forEach(u => u.produces.forEach(p => p.reload()));
      return game;
    } catch (error) {
      console.error('Error parsing save data:', error);
      throw new Error(`Failed to parse save data: ${(error as Error).message}`);
    }
  }

  private calculateTimeToProduce(unit: Unit, n: Decimal): Decimal {
    if (unit.quantity.gt(n)) {
      return new Decimal(0);
    }

    let a = new Decimal(0);
    let b = new Decimal(0);
    let c = new Decimal(0);
    const d = unit.quantity.minus(n);

    for (const prod1 of unit.producedBy.filter(r => r.isActive() && r.unit.unlocked)) {
      // x
      const prodX = prod1.prodPerSec;
      c = c.plus(prodX.times(prod1.unit.quantity));

      for (const prod2 of prod1.unit.producedBy.filter(r2 => r2.isActive() && r2.unit.unlocked)) {
        // x^2
        const prodX2 = prod2.prodPerSec.times(prodX);
        b = b.plus(prodX2.times(prod2.unit.quantity));

        for (const prod3 of prod2.unit.producedBy.filter(r3 => r3.isActive() && r3.unit.unlocked)) {
          // x^3
          const prodX3 = prod3.prodPerSec.times(prodX2);
          a = a.plus(prodX3.times(prod3.unit.quantity));
        }
      }
    }
    a = a.div(6);
    b = b.div(2);

    const solutions = Utils.solveCubic(a, b, c, d);
    return Decimal.min(...(solutions.filter(s => s.gt(0))));
  }

  private calculateTimeToBuy(game: GameModel, action: Action, n: Decimal) {
    const costs = action.getCosts(n);
    let maxTime = new Decimal(0);
    for (const cost of costs) {
      const time = this.calculateTimeToProduce(cost.unit, cost.basePrice);
      // console.log(`You need ${time.toDP(0)} seconds to get ${cost.basePrice} extra ${cost.unit.name}`);
      if (time.gt(maxTime)) {
        maxTime = time;
      }
    }

    return maxTime;
  }

  private calculateGoal(game: GameModel, cost: Cost): Goal {
    // TODO
    const { unit, basePrice } = cost;
    const { buyAction, upHire: twinAction, producedBy } = unit;
    let bestSolution = new Goal();
    bestSolution.name = unit.name;
    if (buyAction) {
      const currentBought = buyAction.quantity;
      const currentTwin = twinAction.quantity;
      // Binary search for optimal twin count
      const maxTwins = new Decimal(80).minus(currentTwin);
      let left = new Decimal(0);
      let right = maxTwins;

      const calculateTimeForTwins = (twinRequired: Decimal): { timeToPrestige: Decimal, buyRequired: Decimal, twinTime: Decimal, buyTime: Decimal } => {
        const twinMultiplier = currentTwin.add(twinRequired).add(1);
        const totalBought = basePrice.div(twinMultiplier).ceil();
        const buyRequired = totalBought.minus(currentBought);
        const twinTime = this.calculateTimeToBuy(game, twinAction, twinRequired);
        const buyTime = this.calculateTimeToBuy(game, buyAction, buyRequired);
        const timeToPrestige = Decimal.max(twinTime, buyTime);

        return { timeToPrestige, buyRequired, twinTime, buyTime };
      };

      // Binary search
      while (left.lte(right)) {
        const mid = left.plus(right).div(2).floor();
        const midPlus1 = mid.plus(1);

        const midResult = calculateTimeForTwins(mid);
        const midPlus1Result = midPlus1.lte(maxTwins) ? calculateTimeForTwins(midPlus1) : null;

        // Update best solution if current mid is better
        if (midResult.timeToPrestige.lt(bestSolution.timeToPrestige)) {
          bestSolution.buyRequired = midResult.buyRequired;
          bestSolution.buyTotal = currentBought.add(midResult.buyRequired);
          bestSolution.twinRequired = mid;
          bestSolution.twinTotal = currentTwin.add(mid);
          bestSolution.buyTime = midResult.buyTime;
          bestSolution.twinTime = midResult.twinTime;
        }

        // Determine search direction
        if (midPlus1Result && midPlus1Result.timeToPrestige.lt(midResult.timeToPrestige)) {
          // Right side is better, search right
          left = mid.plus(1);
        } else if (mid.gt(0)) {
          const midMinus1Result = calculateTimeForTwins(mid.minus(1));
          if (midMinus1Result.timeToPrestige.lt(midResult.timeToPrestige)) {
            // Left side is better, search left
            right = mid.minus(1);
          } else {
            // Found local minimum
            break;
          }
        } else {
          // At left boundary, check if we should search right
          if (midPlus1Result && midPlus1Result.timeToPrestige.lt(midResult.timeToPrestige)) {
            left = mid.plus(1);
          } else {
            break;
          }
        }
      }
    }
    else if (producedBy.length > 0) {
      bestSolution.buyTime = this.calculateTimeToProduce(unit, basePrice);
      bestSolution.twinTime = new Decimal(0);
    }
    return bestSolution;
  }

  private calculatePrestigeTiming(game: GameModel): PrestigeResults {

    const goals = game.world.toUnlock.map(cost => this.calculateGoal(game, cost));

    const results: PrestigeResults = {
      goals,
      timeToPrestige: Decimal.max(...goals.map(g => g.timeToPrestige)),
    };

    return results;
  }

  private displayResults(results: PrestigeResults): void {
    this.prestigeTime.textContent = secondsToString(results.timeToPrestige);
    this.bottleneck.textContent = `${this.findBottleneck(results.goals)}`;
    this.recommendations.innerHTML = '';
    for (const goal of results.goals) {
      this.recommendations.appendChild(this.makeGoalList(goal));
    }

    this.resultsSection.style.display = 'block';
    this.resultsSection.scrollIntoView({ behavior: 'smooth' });
  }

  private findBottleneck(goals: Goal[]): string {
    let current = {
      time: new Decimal(0),
      msg: '',
    };
    for (const goal of goals) {
      if (goal.buyTime.gt(current.time)) {
        current.time = goal.buyTime;
        current.msg = `+${goal.buyRequired} ${goal.name}`;
      }
      if (goal.twinTime.gt(current.time)) {
        current.time = goal.twinTime;
        current.msg = `+${goal.twinRequired} ${goal.name} twins`;
      }
    }
    return current.msg;
  }

  private makeGoalList(goal: Goal) {
    const $li = document.createElement('li');
    $li.appendChild(document.createTextNode(goal.name));
    const $ul = document.createElement('ul');
    $ul.innerHTML = `
      <li>
        Buy: 
        <ul>
          <li>${goal.buyTotal} (+${goal.buyRequired})</li>
          <li>${secondsToString(goal.buyTime)}</li>
        </ul>
      </li>
      <li>Twin:</li>
        <ul>
          <li>${goal.twinTotal} (+${goal.twinRequired})</li>
          <li>${secondsToString(goal.twinTime)}</li>
        </ul>
      </li>
    `;
    $li.appendChild($ul);
    return $li;
  }
}

// Initialize the calculator when the page loads
document.addEventListener('DOMContentLoaded', () => {
  new IdleAntCalculator();
});

function secondsToString(seconds: Decimal) {
  if (seconds.isZero()) {
    return '0 seconds';
  }
  const duration = intervalToDuration({ start: 0, end: seconds.toNumber() * 1000 });
  return formatDuration(duration);
}