import { Component, OnInit } from '@angular/core'
import { NavController } from 'ionic-angular'

import { Subject } from 'rxjs/Subject'
import { Observable } from 'rxjs/Observable'
import { IntervalObservable } from 'rxjs/observable/IntervalObservable'

import 'rxjs/add/observable/timer'
import 'rxjs/add/operator/takeWhile'
import 'rxjs/add/operator/skipUntil'
import 'rxjs/add/operator/debounceTime'
import 'rxjs/add/operator/distinctUntilChanged'

import { ResourceService } from '../../app/resource.service'

@Component({
  templateUrl: 'thermostat.html'
})
export class ThermostatPage implements OnInit {
  private thermostatChange: Subject <string> = new Subject<string>()
  private alive = true
  private interval
  thermostatEndpoint = 'http://192.168.1.74/daikin'
  thermostat = {}
  colorTheme = 'dark'

  constructor(public navCtrl: NavController, private $resource: ResourceService) {
    this.thermostatChange
      .debounceTime(300)
      .distinctUntilChanged()
      .subscribe(x => this.sendThermostatChange())
  }

  ngOnInit() {
    this.getThermostat()
    this.subscribe()
  }

  subscribe () {
    this.interval = IntervalObservable.create(10000)
      .skipUntil(Observable.timer(5000))
      .takeWhile(() => this.alive)
      .subscribe(() => {
        this.getThermostat()
      })
  }

  unsubscribe() {
    this.interval.unsubscribe()
  }

  onThermostatChange(text: string) {
    this.setTheme()
    this.thermostatChange.next(text)
  }

  setTheme() {
    this.colorTheme = this.thermostat.targetMode
  }

  async getThermostat() {
    this.thermostat = await this.$resource.get(this.thermostatEndpoint)
    this.setTheme()
  }

  async sendThermostatChange() {
    this.unsubscribe()
    await this.$resource.post(this.thermostatEndpoint, this.thermostat)
    this.subscribe()
  }

  ngOnDestroy() {
    this.alive = false
  }

}
