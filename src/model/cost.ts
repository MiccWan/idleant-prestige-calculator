import { Decimal } from "decimal.js";
import { first } from 'rxjs/operator/first';
import { any } from 'codelyzer/util/function';
import { GameModel } from './gameModel';
import { GameService } from '../game.service';
import { Unit } from './units/unit';

export class Cost {
  constructor(
    public unit: Unit = null,
    public basePrice: Decimal = new Decimal(1),
    public growFactor: Decimal = new Decimal(1)) { }

  getData() {
    const data: any = {}
    data.u = this.unit.id
    data.b = this.basePrice
    data.g = this.growFactor
    return data
  }


}
