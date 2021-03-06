import {Platform, NavController, Loading, LoadingController, Content, ToastController} from "ionic-angular";
import {AddressLookup} from "../../common/AddressLookup";
import {Scheduler, PickupDay} from "../../common/Scheduler";
import {Geolocation} from "ionic-native";
import moment from "moment";
import {RemindMePage} from "../remindme/RemindMePage";
import {Component, ViewChild} from "@angular/core";
import {rejectFirst, HandledPromiseError} from "../../common/PromiseExceptionHandler";
import {DetailPage} from "../detail/DetailPage";
import {UrlUtil} from "../../common/UrlUtil";

@Component({
  templateUrl: 'HomePage.html'
})
export class HomePage {
  public static readonly ERROR_LOADING = 'We Had a Problem Loading Your Schedule. \nThe City of Houston may be having issues';
  @ViewChild(Content) content: Content;
  private coords;
  private geolocation:any;
  private pickupDays:PickupDay;
  private addressLookup;

  moment;
  addresses;
  searching:Boolean;
  events = [];
  errorMessage?:string;
  loadingContent:Loading;
  loading:boolean;
  currentSearch:string;

  constructor(public toastCtrl: ToastController, private loadingController:LoadingController, private platform:Platform, private nav:NavController, private SchedulerService:Scheduler, addressLookup:AddressLookup) {
    this.moment = moment;
    this.geolocation = Geolocation;
    this.addressLookup = addressLookup;
    this.announceUpdates();
    this.loadEvents();
  }

  announceUpdates() {
    if(!window.localStorage.getItem('announcedTapTypes')) {
      window.localStorage.setItem('announcedTapTypes', true.toString());
      let toast = this.toastCtrl.create({
        message: 'You can now tap the types of trash to learn more!',
        showCloseButton: true,
        duration: 20000,
      });
      toast.present();
    }
  }

  openHolidaySchedule() {
    UrlUtil.openUrl('http://www.houstontx.gov/solidwaste/holiday.html');
  }
  showFilterBar() {
    this.content.scrollToTop();
    this.searching = true;
  }

  lookupCurrentLocation() {
    this.searching = false;
    this.addresses = null;
    this.loadEvents();
  }

  selectAddress(suggestion) {
    this.searching = false;
    this.addresses = null;
    this.showLoader('Looking up Coordinates');
    this.addressLookup.lookupCoordinates(suggestion)
      .then(r => {
        this.showLoader('Looking up Schedule');
        return this.loadEventsForPosition(r);
      }, e => this.showError("Unable to Locate You"))
      .then(r => {
        this.hideLoader();
        return r;
      }, e => this.showError("Error Loading Events"))
      .catch(e => {
        this.hideLoader();
        throw "Error Loading Events";
      });
  }

  searchAddress(str) {
    console.log('searching for ', str);
    if (str.length <= 2) {
      this.addresses = null;
      return;
    }
    this.currentSearch = str;
    this.addressLookup.lookupAddress(str).then((results) => {
      //deal with variable loading times, we create a token to make sure we are only showing the latest results
      if (str === this.currentSearch) {
        console.log('address results', results, str, this.currentSearch);
        this.addresses = results;
      }
      else {
        console.log('ignoring slow result', str, this.currentSearch);
      }
    });
  }

  goToDetails(category) {
    console.log(category, 'category go!');
    this.nav.push(DetailPage, {
      category: category
    });
  }

  goToRemindMe() {
    this.nav.push(RemindMePage, {
      latitude: this.coords.latitude,
      longitude: this.coords.longitude,
    });
  }

  static dateFilter(day) {
    if (moment().isSame(day, 'day')) {
      return 'Today ' + day.format('MMM Do');
    } else if (moment().add(1, 'days').isSame(day, 'day')) {
      return 'Tomorrow ' + day.format('MMM Do');
    } else {
      return day.format('dddd MMM Do');
    }
  }

  static dayOfWeek(day) {
    return moment().day(day).format("dddd");
  }

  showLoader(str = 'One Sec!') {
    if (!this.loadingContent) {
      this.loadingContent = this.loadingController.create({content: str});
    }

    //hack see: https://github.com/driftyco/ionic/issues/6103
    this.loadingContent.data.content = str;
    if (!this.loading) {
      this.loadingContent.present();
      this.loading = true;
    }
  }

  hideLoader() {
    this.loading = false;
    if (this.loadingContent) {
      this.loadingContent.dismiss();
      this.loadingContent = null;
    }
  }

  loadEvents() {
    this.showLoader('Starting Up!');
    return this.platform.ready().then(() => {
      this.showLoader('Finding Your Location');
      return this.geolocation.getCurrentPosition()
        .then(pos => {
          this.showLoader('Looking Up Your Schedule!');
          return pos;
        })
        .catch(rejectFirst('We couldn\'t look up your location.\n Check Your Location Permissions'))
        .then(this.loadEventsForPosition.bind(this))
        .catch(rejectFirst(HomePage.ERROR_LOADING));
    }).then(this.hideLoader.bind(this), this.promiseCatcher);
  }

  // meant to be used in conjunction with promise utils to display the error of the first promise
  // written in this way to bind(this)
  promiseCatcher = (error:any):void => {
      console.log('error happened?', error);
      if (error instanceof HandledPromiseError) {
        this.showError(error.message)
      }
      else {
        this.showError('Something Went Wrong...');
      }
      this.hideLoader.bind(this)
  };


  errorFindingPosition(err) {
    this.showError('Error Finding Position');
    console.error('Error Finding Position', err);
  }

  showError(errorMessage) {
    console.error(errorMessage, this.errorFindingPosition.bind(this));
    this.hideLoader();
    this.errorMessage = errorMessage;
  }

  clearError():void {
    this.hideLoader();
    this.errorMessage = null;
  }

  retry():Promise<Array<any>> {
    this.showLoader('Trying again');
    this.clearError();
    console.log('reloading', this.coords);
    if(!this.coords) {
      //if no coords try to geolocate again
      return this.loadEvents();
    }
    else {
      //they might have put in a custom address so try to look up the same ones
      return this.loadEventsForPosition({coords: this.coords})
        .catch(rejectFirst(HomePage.ERROR_LOADING))
        .then(r => {
          this.hideLoader();
          return r
        }, this.promiseCatcher);
    }
  }

  loadEventsForPosition(pos):Promise<Array<any>> {
    //data format from arcgis is all over the place, need to standardize this to prevent headaches :-/
    if (pos.x && !pos.coords) {
      pos.coords = {
        latitude: pos.y,
        longitude: pos.x
      };

    }
    this.coords = pos.coords;
    this.SchedulerService.init(pos, 90);

    return this.SchedulerService.whenLoaded.then(() => {
      this.events = this.SchedulerService.events;
      this.pickupDays = this.SchedulerService.pickupDays;
      this.hideLoader();
      return this.events;
    });
  }
}
