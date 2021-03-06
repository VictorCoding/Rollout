import {Injectable} from '@angular/core';
import {Http, URLSearchParams, RequestOptions} from '@angular/http';
import moment from 'moment';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/toPromise';

export interface PosXY {x:number,y:number};
export interface PosCoords {coords: {latitude:number,longitude:number}};
export interface PosArcGis {x:number,y:number, spatialReference: any};
export type Position = PosXY | PosCoords;

const navigator:any = window.navigator;
let locale = navigator.userLanguage || window.navigator.language;
moment.locale(locale);

/**
 *
 * A shim for the rollout houston api
 * http://api.rollouthouston.com
 **/

export interface PickupDay {wasteDay:number; junkWeekOfMonth:number; junkDay:number; recyclingDay:number; recyclingOnEvenWeeks:boolean}

@Injectable()
export class Scheduler {
  http:Http;
  numberOfDays:number;
  pickupDays:PickupDay;
  holidays;
  events:Array<any>;
  whenLoaded:Promise<any>;
  private pos:PosArcGis;

  constructor(http:Http) {
    this.http = http;
  }

  /**
   * Initializes the obj with event data
   * @param pos
   * @param numberOfDays
   */
  init(pos:Position, numberOfDays:number = 60) {
    this.numberOfDays = numberOfDays;

    if ((<PosCoords> pos).coords) {
      this.pos = {y: (<PosCoords> pos).coords.latitude, x: (<PosCoords> pos).coords.longitude, spatialReference: {"wkid": 4326}};
    }
    else  {
      this.pos = {x: (<PosXY> pos).x, y:(<PosXY> pos).y, spatialReference: {"wkid": 4326}};
    }
    //http://api.rollouthouston.com/upcoming?latitude=29.7982722&longitude=-95.3736702

    let params = {
      latitude: this.pos.y,
      longitude: this.pos.x,
      days: this.numberOfDays
    };
    const searchParams = new URLSearchParams();
    //bs we have to deal with until someone does this https://github.com/angular/angular/issues/7370
    for (let param in params) {
      searchParams.set(param, params[param]);
    }
    const reqOptions = new RequestOptions({search: searchParams});
    let schedulePromise = this.http.get('http://api.rollouthouston.com/upcoming',
      reqOptions).map(res => res.json()).toPromise();
    this.whenLoaded = schedulePromise.then((r)=> {
      //convet days to moment objects for great justice
      r.events.forEach(e => e.day = moment(e.day));
      this.events = r.events;
      this.pickupDays = r.schedule;
    }).catch(e => {
      throw new Error("Error Loading Schedule: " + e.errorMessage);
    });
  }
}