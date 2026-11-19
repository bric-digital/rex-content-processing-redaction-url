export class DataPointStore {
  constructor() {
    this.points = []
  }

  recordPoints(dataPoints) {
    for (const dataPoint of dataPoints) {
      this.points.push(dataPoint)
    }
  }

  clear() {
    this.points = []
  }

  get size() {
    return this.points.length
  }
}
