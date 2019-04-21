/*
    Defines an instance of a game - it relies on a socket already being established and passed in at
    time of instantiation. The idea is to allow the ability to allow multiple instances of the game
    to run on the same screen,but under different canvases. This makes it easier to run automated tests
    as I wouldn't have to launch multiple browsers via CLI and pass in messy parameters via the URL.

 */

//Slightly archaic JS, but I like the extra control over the architecture
//I could have bundled everything with automation tools, but this is easier to set up

//constructor
//canvas - the target cavas element onto which to render
//socket - the established socket with which to communicate with the server
game = function(canvas, socket, token) {
    this.canvas = canvas;
    this.socket = socket;
    this.token = token;

    //init world objects to default
    this.scene = undefined;
    this.camera = undefined;
    this.renderer = undefined;
    this.backgroundMesh = undefined;
    this.redZone = undefined;
    this.intersectionPlane = undefined; //Using this as a dummy math object to calculate the intersection of the mouse position

    //contains all elements of a player tank - all player objects spawn off of it

    this.playerTank = undefined;
    this.otherPlayers = {};
    this.movementVector = new THREE.Vector3(0, 0, 0);
    this.movementVelocity = 0;// new THREE.Vector3(0, 0, 0); //received from the server
    this.lastRender = undefined; //the timestamp of the last render loop - use to calculate movement interpolation
    this.pressedMovementKey = {
        a: false,
        d: false,
        s: false,
        w: false
    };
};

game.prototype = {
    //set up an instance of the game
    init: function() {
        console.log("init");
        console.log(this.canvas);
        console.log(this.socket);
        this.configSocket();
        this.socket.emit('joinGame', {token: token});
    },

    configSocket: function() {
        let that = this;
        this.socket.on("playerStart", function(data) {
            console.log("playerStart");
            console.log(data);
            that.initScene(data);
        });
        this.socket.on("tick", function(data) {
            console.log("tick");
            console.log(data);

            if (data.players[that.token] === undefined) {
                return;
            }
            //set player position
            let newPost = data.players[that.token].position;
            if (newPost !== undefined) {
                that.playerTank.setPosition(newPost.x, newPost.y, newPost.z)
            }
            delete data.players[that.token];

            that.updateOtherPlayers(data.players);
        });
    },

    updateOtherPlayers: function(playerData) {
        for (let k in playerData) {
            //if a client-side representation does not exit, create it
            if (!this.otherPlayers.hasOwnProperty(k)) {
                this.createNewTank(k, playerData[k]);
            }
            //if representation already exists
            else {
                this.otherPlayers[k].setPosition(playerData[k].position.x, playerData[k].position.y, playerData[k].position.z);
                this.otherPlayers[k].setLookAt(new THREE.Vector3(playerData[k].lookAt.x, 5, playerData[k].lookAt.z));
            }
        }
    },

    createNewTank: function(id, state) {
        console.log(state);
        this.otherPlayers[id] = new game.tank();
        this.otherPlayers[id].body = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), new THREE.MeshBasicMaterial({color: 0x57f92a}));
        this.otherPlayers[id].body.position.set(0, 0, 0);

        this.otherPlayers[id].turret = new THREE.Mesh(new THREE.SphereGeometry(1.25, 32, 32), new THREE.MeshBasicMaterial({color: 0xf92a2a}));
        this.otherPlayers[id].turret.position.set(0, 3, 0);
        this.otherPlayers[id].turret.up.set(0, 0, -1);

        let gunGeometry = new THREE.BoxGeometry(0.5, 0.5, 5);
        gunGeometry.translate(0, 0, 3);
        this.otherPlayers[id].gun = new THREE.Mesh(gunGeometry, new THREE.MeshBasicMaterial({color: 0x333333}));
        this.otherPlayers[id].gun.position.set(0, 5, 0);
        this.otherPlayers[id].gun.up.set(0, 0, -1);

        this.otherPlayers[id].turretGroup = new THREE.Group();
        this.otherPlayers[id].turretGroup.add(this.otherPlayers[id].turret);
        this.otherPlayers[id].turretGroup.add(this.otherPlayers[id].gun);
        this.otherPlayers[id].turretGroup.up.set(0, 0, -1);
        this.otherPlayers[id].turretGroup.position.set(0, 5, 0);


        this.otherPlayers[id].group = new THREE.Group();
        this.otherPlayers[id].group.add(this.otherPlayers[id].body);
        this.otherPlayers[id].group.add(this.otherPlayers[id].turretGroup);
        this.otherPlayers[id].group.position.set(state.position.x, state.position.y, state.position.z);
        this.otherPlayers[id].group.up.set(0, 0, -1);

        this.otherPlayers[id].setLookAt(new THREE.Vector3(state.lookAt.x, 5, state.lookAt.z));

        // this.scene.add(this.playerTank.body);
        // this.scene.add(this.playerTank.turret);
        this.scene.add(this.otherPlayers[id].group);
    },

    initScene: function(newPlayerData) {
        this.movementVelocity = newPlayerData.movementVelocity;

        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-55, 55, 55, -55, 1, 100); //create a fixed orthographic camera
        this.camera.position.set(0, 50, 0);
        this.camera.lookAt(new THREE.Vector3(0, 0 , 0));
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
        this.canvas.append(this.renderer.domElement); //append renderer to DOM

        //set up the game field
        this.backgroundMesh = new THREE.Mesh(new THREE.PlaneGeometry(100, 100, 32), new THREE.MeshBasicMaterial( {color: 0xd1d1d1, side: THREE.DoubleSide} ));
        this.backgroundMesh.setRotationFromEuler(new THREE.Euler( 1.57, 0, 0, 'XYZ' )); //rotate to coincide with -Z axis into the screen
        this.redZone = new THREE.Mesh(new THREE.PlaneGeometry(110, 110, 32), new THREE.MeshBasicMaterial( {color: 0xff3535, side: THREE.DoubleSide} ));
        this.redZone.position.set(0, -10, 0); //set behind the main field
        this.redZone.setRotationFromEuler(new THREE.Euler( 1.57, 0, 0, 'XYZ' ));
        this.scene.add(this.backgroundMesh);
        this.scene.add(this.redZone);

        //not really part of the scene, just used to help with some math
        this.intersectionPlane = new THREE.Mesh(new THREE.PlaneGeometry(70, 70, 32, 32), new THREE.MeshBasicMaterial({color: 0x00FFFF, visible: true}));
        this.intersectionPlane.position.set(0, 11, 0);
        this.intersectionPlane.setRotationFromEuler(new THREE.Euler( 1.57, 0, 0, 'XYZ' ));
        //this.intersectionPlane.up.set(0, 1, 0);
        this.scene.add(this.intersectionPlane);

        //spawn player at the location given by the server
        this.playerTank = new game.tank();
        this.playerTank.body = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), new THREE.MeshBasicMaterial({color: 0x1900ff}));
        this.playerTank.body.position.set(0, 0, 0);

        this.playerTank.turret = new THREE.Mesh(new THREE.SphereGeometry(1.25, 32, 32), new THREE.MeshBasicMaterial({color: 0xf6ff00}));
        this.playerTank.turret.position.set(0, 3, 0);
        this.playerTank.turret.up.set(0, 0, -1);

        let gunGeometry = new THREE.BoxGeometry(0.5, 0.5, 5);
        gunGeometry.translate(0, 0, 3);
        this.playerTank.gun = new THREE.Mesh(gunGeometry, new THREE.MeshBasicMaterial({color: 0x333333}));
        this.playerTank.gun.position.set(0, 5, 0);
        this.playerTank.gun.up.set(0, 0, -1);

        this.playerTank.turretGroup = new THREE.Group();
        this.playerTank.turretGroup.add(this.playerTank.turret);
        this.playerTank.turretGroup.add(this.playerTank.gun);
        this.playerTank.turretGroup.up.set(0, 0, -1);
        this.playerTank.turretGroup.position.set(0, 5, 0);


        this.playerTank.group = new THREE.Group();
        this.playerTank.group.add(this.playerTank.body);
        this.playerTank.group.add(this.playerTank.turretGroup);
        this.playerTank.group.position.set(newPlayerData.pos.x, newPlayerData.pos.y, newPlayerData.pos.z);
        this.playerTank.group.up.set(0, 0, -1);

        this.playerTank.setLookAt(new THREE.Vector3(0, 5, -40));

       // this.scene.add(this.playerTank.body);
       // this.scene.add(this.playerTank.turret);
        this.scene.add(this.playerTank.group);

        //add event listeners on the canvas container
        let that = this;
        this.canvas.onmousemove = function(e) {
            let raycaster = new THREE.Raycaster();
            let mousePosition = new THREE.Vector2(0, 0);
            //the position on the canvas element has to be mapped to the 3D world
            mousePosition.x = (e.clientX / that.canvas.clientWidth) * 2 - 1;
            mousePosition.y = -(e.clientY / that.canvas.clientHeight) * 2 + 1;
            raycaster.setFromCamera(mousePosition, that.camera);
            var intersections = raycaster.intersectObject(that.redZone);
            //there shouldn't be more than 1 intersection, but we'll just get the first element anyways
            if (intersections.length > 0) {
                that.playerTank.setLookAt(new THREE.Vector3(intersections[0].point.x, 5, intersections[0].point.z));
            }
        };

        //movement controls should be spawned off as a separate module, but this is fine for now
        this.canvas.parentElement.onkeydown = function(e) {
            if (e.key === "a" || e.key === "d" || e.key === "s" || e.key === "w") {
                //let v = new THREE.Vector3(0, 0 ,0); // will add the component movements based on pressed keys, then it will be nomalized
                switch (e.key) {
                    case "a" :
                        //that.movementVector.x = that.movementVector.x - 1;
                        that.pressedMovementKey.a = true;
                        break;
                    case "d" :
                        //that.movementVector.x = that.movementVector.x + 1;
                        that.pressedMovementKey.d = true;
                        break;
                    case "s" :
                        //that.movementVector.z = that.movementVector.z + 1;
                        that.pressedMovementKey.s = true;
                        break;
                    case "w" :
                        //that.movementVector.z = that.movementVector.z - 1;
                        that.pressedMovementKey.w = true;
                        break;
                }
                //that.movementVector.normalize();
            }
        };

        this.canvas.parentElement.onkeyup = function(e) {
            console.log(e.key);
            if (e.key === "a" || e.key === "d" || e.key === "s" || e.key === "w") {
                switch (e.key) {
                    case "a" :
                        that.pressedMovementKey.a = false;
                        break;
                    case "d" :
                        that.pressedMovementKey.d = false;
                        break;
                    case "s" :
                        that.pressedMovementKey.s = false;
                        break;
                    case "w" :
                        that.pressedMovementKey.w = false;
                        break;
                }
            }
        };

        this.render();
    },

    render: function() {
        if (this.lastRender !== undefined) {
            let newTime = new Date();
            let delta = (newTime - this.lastRender) / 1000; //time difference in seconds
            this.lastRender = newTime;

            //calculate the movement vector by checking the current keys that are pressed
            //controls on X axis
            if (this.pressedMovementKey.a === true) {
                this.movementVector.x = this.movementVector.x - 1;
            }

            if (this.pressedMovementKey.d === true) {
                this.movementVector.x = this.movementVector.x + 1;
            }
            if (this.pressedMovementKey.d === false && this.pressedMovementKey.a === false) {
                this.movementVector.x = 0;
            }

            //controls on Z axis
            if (this.pressedMovementKey.s === true) {
                this.movementVector.z = this.movementVector.z + 1;
            }
            if (this.pressedMovementKey.w === true) {
                this.movementVector.z = this.movementVector.z - 1;
            }
            if (this.pressedMovementKey.s === false && this.pressedMovementKey.w === false) {
                this.movementVector.z = 0;
            }
            this.movementVector.normalize();

            //translate the player tank to new position
            this.playerTank.translateX((this.movementVector.x * this.movementVelocity) * delta);
            this.playerTank.translateZ((this.movementVector.z * this.movementVelocity) * delta);
        }
        else {
            this.lastRender = new Date();
        }

        //update the server on this player's state
        this.socket.emit('playerUpdate', {
            token: token,
            tankState: {
                movement: this.movementVector,
                lookAt: this.playerTank.getLookAt()
            }
        });

        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(this.render.bind(this));

    }

};