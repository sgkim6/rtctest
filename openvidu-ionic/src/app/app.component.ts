import { HttpClient, HttpHeaders } from "@angular/common/http";
import { Component, HostListener, OnDestroy } from "@angular/core";
import { AndroidPermissions } from "@ionic-native/android-permissions/ngx";
import { SplashScreen } from "@ionic-native/splash-screen/ngx";
import { StatusBar } from "@ionic-native/status-bar/ngx";
import { Platform, AlertController } from "@ionic/angular";
import {
	Device,
	OpenVidu,
	Publisher,
	PublisherProperties,
	Session,
	StreamEvent,
	StreamManager,
	Subscriber,
} from "openvidu-browser";
import { throwError as observableThrowError } from "rxjs";
import { catchError } from "rxjs/operators";

@Component({
	selector: "app-root",
	templateUrl: "app.component.html",
	styleUrls: ["app.component.css"],
})
export class AppComponent implements OnDestroy {
	OPENVIDU_SERVER_URL = "https://" + location.hostname + ":4443";
	OPENVIDU_SERVER_SECRET = "MY_SECRET";

	ANDROID_PERMISSIONS = [
		this.androidPermissions.PERMISSION.CAMERA,
		this.androidPermissions.PERMISSION.RECORD_AUDIO,
		this.androidPermissions.PERMISSION.MODIFY_AUDIO_SETTINGS,
	];

	// OpenVidu objects
	OV: OpenVidu;
	session: Session;
	publisher: StreamManager; // Local
	subscribers: StreamManager[] = []; // Remotes

	// Join form
	mySessionId: string;
	myUserName: string;

	cameraIcon = "videocam";
	microphoneIcon = "mic";

	private devices: Device[];
	private cameras: Device[];
	private microphones: Device[];
	private cameraSelected: Device;
	private microphoneSelected: Device;
    private isFrontCamera: boolean = false;

	constructor(
		private platform: Platform,
		private splashScreen: SplashScreen,
		private statusBar: StatusBar,
		private httpClient: HttpClient,
		private androidPermissions: AndroidPermissions,
		public alertController: AlertController
	) {
		this.initializeApp();
		this.generateParticipantInfo();
	}

	initializeApp() {
		this.platform.ready().then(() => {
			this.statusBar.overlaysWebView(false);
			this.splashScreen.hide();
		});
	}

	@HostListener("window:beforeunload")
	beforeunloadHandler() {
		// On window closed leave session
		this.leaveSession();
	}

	ngOnDestroy() {
		// On component destroyed leave session
		this.leaveSession();
	}

	async joinSession() {
		// --- 1) Get an OpenVidu object ---

		this.OV = new OpenVidu();

		this.initDevices();

		// --- 2) Init a session ---

		this.session = this.OV.initSession();

		// --- 3) Specify the actions when events take place in the session ---

		// On every new Stream received...
		this.session.on("streamCreated", (event: StreamEvent) => {
			// Subscribe to the Stream to receive it. Second parameter is undefined
			// so OpenVidu doesn't create an HTML video on its own
			const subscriber: Subscriber = this.session.subscribe(
				event.stream,
				undefined
			);
			this.subscribers.push(subscriber);
		});

		// On every Stream destroyed...
		this.session.on("streamDestroyed", (event: StreamEvent) => {
			// Remove the stream from 'subscribers' array
			this.deleteSubscriber(event.stream.streamManager);
		});

		// On every asynchronous exception...
		this.session.on("exception", (exception) => {
			console.warn(exception);
		});

		// --- 4) Connect to the session with a valid user token ---

		try {
			// 'getToken' method is simulating what your server-side should do.
			// 'token' parameter should be retrieved and returned by your own backend
			const token = await this.getToken();
			// First param is the token got from OpenVidu Server. Second param will be used by every user on event
			// 'streamCreated' (property Stream.connection.data), and will be appended to DOM as the user's nickname
			await this.session.connect(token, { clientData: this.myUserName });

			// --- 5) Requesting and Checking Android Permissions
			if (this.platform.is("cordova")) {
				// Ionic platform
				if (this.platform.is("android")) {
					console.log("Android platform");
					await this.checkAndroidPermissions();
					this.initPublisher();
				} else if (this.platform.is("ios")) {
					console.log("iOS platform");
					this.initPublisher();
				}
			} else {
				this.initPublisher();
			}
		} catch (error) {
			console.log(
				"There was an error connecting to the session:",
				error.code,
				error.message
			);
		}
	}

	async initPublisher() {
		// Init a publisher passing undefined as targetElement (we don't want OpenVidu to insert a video
		// element: we will manage it on our own) and with the desired properties
		const publisher: Publisher = await this.OV.initPublisherAsync(undefined, {
			audioSource: this.microphones[0].deviceId, // The source of audio. If undefined default microphone
			videoSource: this.cameras[0].deviceId, // The source of video. If undefined default webcam
			publishAudio: true, // Whether you want to start publishing with your audio unmuted or not
			publishVideo: true, // Whether you want to start publishing with your video enabled or not
			resolution: "640x480", // The resolution of your video
			frameRate: 30, // The frame rate of your video
			insertMode: "APPEND", // How the video is inserted in the target element 'video-container'
			mirror: this.isFrontCamera, // Whether to mirror your local video or not
		});

		// --- 6) Publish your stream ---

		await this.session.publish(publisher);
		// Store our Publisher
		this.publisher = publisher;
	}

	leaveSession() {
		// --- 7) Leave the session by calling 'disconnect' method over the Session object ---

		if (this.session) {
			this.session.disconnect();
		}

		// Empty all properties...
		this.subscribers = [];
		delete this.publisher;
		delete this.session;
		delete this.OV;
		this.generateParticipantInfo();
	}

	async swapCamera() {
		try {
			const newCamera = this.cameras.find(
				(cam) => cam.deviceId !== this.cameraSelected.deviceId
			);
			if (!!newCamera) {

				this.isFrontCamera = !this.isFrontCamera;
				const pp: PublisherProperties = {
					videoSource: newCamera.deviceId,
					audioSource: false,
					mirror: this.isFrontCamera
				};

				// Stopping the video tracks after request for another MediaStream
				this.publisher.stream.getMediaStream().getVideoTracks().forEach((track) => {
					track.stop();
				});
				const newTrack = await this.OV.getUserMedia(pp);
				const videoTrack: MediaStreamTrack = newTrack.getVideoTracks()[0];
				await (this.publisher as Publisher).replaceTrack(videoTrack);
                this.cameraSelected = newCamera;
			}
		} catch (error) {
			console.error(error);
		}
	}
	toggleCamera() {
		const publish = !this.publisher.stream.videoActive;
		(this.publisher as Publisher).publishVideo(publish, true);
		this.cameraIcon = publish ? "videocam" : "eye-off";
	}

	toggleMicrophone() {
		const publish = !this.publisher.stream.audioActive;
		(this.publisher as Publisher).publishAudio(publish);
		this.microphoneIcon = publish ? "mic" : "mic-off";
	}

	private async initDevices() {
		this.devices = await this.OV.getDevices();

		this.cameras = this.devices.filter((d) => d.kind === "videoinput");
		this.microphones = this.devices.filter(
			(d) => d.kind === "audioinput" && d.label !== "Default"
		);

		this.cameraSelected = this.cameras[0];
		this.microphoneSelected = this.microphones[0];
	}

	private checkAndroidPermissions(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.platform.ready().then(() => {
				this.androidPermissions
					.requestPermissions(this.ANDROID_PERMISSIONS)
					.then(() => {
						this.androidPermissions
							.checkPermission(this.androidPermissions.PERMISSION.CAMERA)
							.then((camera) => {
								this.androidPermissions
									.checkPermission(
										this.androidPermissions.PERMISSION.RECORD_AUDIO
									)
									.then((audio) => {
										this.androidPermissions
											.checkPermission(
												this.androidPermissions.PERMISSION.MODIFY_AUDIO_SETTINGS
											)
											.then((modifyAudio) => {
												if (
													camera.hasPermission &&
													audio.hasPermission &&
													modifyAudio.hasPermission
												) {
													resolve();
												} else {
													reject(
														new Error(
															"Permissions denied: " +
																"\n" +
																" CAMERA = " +
																camera.hasPermission +
																"\n" +
																" AUDIO = " +
																audio.hasPermission +
																"\n" +
																" AUDIO_SETTINGS = " +
																modifyAudio.hasPermission
														)
													);
												}
											})
											.catch((err) => {
												console.error(
													"Checking permission " +
														this.androidPermissions.PERMISSION
															.MODIFY_AUDIO_SETTINGS +
														" failed"
												);
												reject(err);
											});
									})
									.catch((err) => {
										console.error(
											"Checking permission " +
												this.androidPermissions.PERMISSION.RECORD_AUDIO +
												" failed"
										);
										reject(err);
									});
							})
							.catch((err) => {
								console.error(
									"Checking permission " +
										this.androidPermissions.PERMISSION.CAMERA +
										" failed"
								);
								reject(err);
							});
					})
					.catch((err) => console.error("Error requesting permissions: ", err));
			});
		});
	}

	private generateParticipantInfo() {
		// Random user nickname and sessionId
		this.mySessionId = "SessionA";
		this.myUserName = "Participant" + Math.floor(Math.random() * 100);
	}

	private deleteSubscriber(streamManager: StreamManager): void {
		const index = this.subscribers.indexOf(streamManager, 0);
		if (index > -1) {
			this.subscribers.splice(index, 1);
		}
	}

	async presentSettingsAlert() {
		const alert = await this.alertController.create({
			header: "OpenVidu Server config",
			inputs: [
				{
					name: "url",
					type: "text",
					value: "https://demos.openvidu.io",
					placeholder: "URL",
				},
				{
					name: "secret",
					type: "text",
					value: "MY_SECRET",
					placeholder: "Secret",
				},
			],
			buttons: [
				{
					text: "Cancel",
					role: "cancel",
					cssClass: "secondary",
				},
				{
					text: "Ok",
					handler: (data) => {
						this.OPENVIDU_SERVER_URL = data.url;
						this.OPENVIDU_SERVER_SECRET = data.secret;
					},
				},
			],
		});

		await alert.present();
	}

	/*
	 * --------------------------
	 * SERVER-SIDE RESPONSIBILITY
	 * --------------------------
	 * This method retrieve the mandatory user token from OpenVidu Server,
	 * in this case making use Angular http API.
	 * This behaviour MUST BE IN YOUR SERVER-SIDE IN PRODUCTION. In this case:
	 *   1) Initialize a Session in OpenVidu Server	(POST /openvidu/api/sessions)
	 *   2) Create a Connection in OpenVidu Server (POST /openvidu/api/sessions/<SESSION_ID>/connection)
	 *   3) The Connection.token must be consumed in Session.connect() method
	 */

	getToken(): Promise<string> {
		if (
			this.platform.is("ios") &&
			this.platform.is("cordova") &&
			this.OPENVIDU_SERVER_URL === "https://localhost:4443"
		) {
			// To make easier first steps with iOS apps, use demos OpenVidu Sever if no custom valid server is configured
			this.OPENVIDU_SERVER_URL = "https://demos.openvidu.io";
		}
		return this.createSession(this.mySessionId).then((sessionId) => {
			return this.createToken(sessionId);
		});
	}

	createSession(sessionId) {
		return new Promise((resolve, reject) => {
			const body = JSON.stringify({ customSessionId: sessionId });
			const options = {
				headers: new HttpHeaders({
					Authorization:
						"Basic " + btoa("OPENVIDUAPP:" + this.OPENVIDU_SERVER_SECRET),
					"Content-Type": "application/json",
				}),
			};
			return this.httpClient
				.post(
					this.OPENVIDU_SERVER_URL + "/openvidu/api/sessions",
					body,
					options
				)
				.pipe(
					catchError((error) => {
						if (error.status === 409) {
							resolve(sessionId);
						} else {
							console.warn(
								"No connection to OpenVidu Server. This may be a certificate error at " +
									this.OPENVIDU_SERVER_URL
							);
							if (
								window.confirm(
									'No connection to OpenVidu Server. This may be a certificate error at "' +
										this.OPENVIDU_SERVER_URL +
										// tslint:disable-next-line:max-line-length
										'"\n\nClick OK to navigate and accept it. If no certificate warning is shown, then check that your OpenVidu Server' +
										'is up and running at "' +
										this.OPENVIDU_SERVER_URL +
										'"'
								)
							) {
								location.assign(
									this.OPENVIDU_SERVER_URL + "/accept-certificate"
								);
							}
						}
						return observableThrowError(error);
					})
				)
				.subscribe((response) => {
					console.log(response);
					resolve(response["id"]);
				});
		});
	}

	createToken(sessionId): Promise<string> {
		return new Promise((resolve, reject) => {
			const body = JSON.stringify({});
			const options = {
				headers: new HttpHeaders({
					Authorization:
						"Basic " + btoa("OPENVIDUAPP:" + this.OPENVIDU_SERVER_SECRET),
					"Content-Type": "application/json",
				}),
			};
			return this.httpClient
				.post(
					this.OPENVIDU_SERVER_URL +
						"/openvidu/api/sessions/" +
						sessionId +
						"/connection",
					body,
					options
				)
				.pipe(
					catchError((error) => {
						reject(error);
						return observableThrowError(error);
					})
				)
				.subscribe((response) => {
					console.log(response);
					resolve(response["token"]);
				});
		});
	}
}
