const express = require('express');
const app = express();
const path = require('path');
const PORT = 3000;
const mysql = require('mysql2');
const axios = require('axios');
const bodyParser = require('body-parser');
const session = require('express-session');
const moment = require('moment'); 
const crypto = require('crypto'); // for encryption
const { off } = require('process');
const { fileLoader } = require('ejs');
moment().format();
require('dotenv').config();

// Setting up database with MySQL
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'sql8623463',
    port: '8889'
});

// Checking if its connected to the database
connection.connect((err) => {
    if (err) {
        return console.log(err.message);
    }
    console.log("Connect to Local DB");
});

// Intializing session for login and signup
app.use(session({
    secret: 'secret',
    saveUninitialized: true,
    cookie: { maxAge: 60 * 60 * 1000 },
    resave: true,

}));

// setup for EJS 
app.set('view engine', 'ejs')
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '/public')));
app.use(bodyParser.urlencoded({ extended: true }));

// Functions that encrypts password and converts to hexadecimal String
function encryptPassword(password) {
    const key = crypto.pbkdf2Sync(password, 'salt', 100000, 64, 'sha512');
    return key.toString('hex');
}

// Functions that encrypts password and converts to hexadecimal String and compares it.
function verifyPassword(password, hash) {
    const key = crypto.pbkdf2Sync(password, 'salt', 100000, 64, 'sha512');
    const passwordHash = key.toString('hex');
    return passwordHash === hash;
}


// GET Request for Hompage 
app.get('/', (req, res) => {

    let api_url = process.env.API_URL  
    let charts_title = [];
    let top_charts = [];
    let sessionObj = req.session;
    let loggedIn = false;
    if (sessionObj.sess_valid) {
        loggedIn = true;
    }
    let isEmpty = true;
    let playlist_names = [];
    let already_exists = false;
    let most_collected = [];
    let chart_most_collected = [];
    let urlParams = new URLSearchParams(req.url);
    let showModal = urlParams.get('showModal') === 'true';

    axios.get(api_url).then(results => {
        top_charts = results.data.results;
        // console.log(top_charts);
        top_charts.forEach((item) => {
            const [artistName, albumTitle] = item.title.split("-");
            charts_title.push({
                album_id: item.id, artist_name: artistName.trim(), title: albumTitle.trim(), date: item.year, img_url: item.cover_image
            });
        });
        res.render('index', {  charts_title, loggedIn, isEmpty, playlist_names, activeTab: 'home',topplaylist,chart_most_collected ,showModal});
    });
    let user_id = sessionObj.user_id;
    let playlistQuerySearch = `SELECT * FROM playlist WHERE user_id = ?`;

    connection.query(playlistQuerySearch, [user_id],(err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            isEmpty = false;
            results.forEach((item) => {
                playlist_names.push({
                    playlist_title: item.playlist_name, playlist_id: item.playlist_id
                })
            });

        } else {
            isEmpty = true;
        }
    });

    let topplaylist =[];
    let collectionQuery = `SELECT p.*, r.vote, u.user_name 
    FROM playlist p 
    LEFT JOIN rating r ON p.playlist_id = r.playlist_id 
    JOIN user u ON p.user_id = u.user_id
    WHERE p.privacy = 0
    ORDER BY COALESCE(r.vote, 0) DESC 
    LIMIT 20         
    `
   
    connection.query(collectionQuery ,(err,results)=>{
        if(err) throw err;
        results.forEach((item) => {
            let playlist_id = item.playlist_id;
            let album_query = `SELECT album_id
            FROM album_playlist
            WHERE playlist_id = ${playlist_id}
            LIMIT 1;
            `
                let id = [];
                let img_url = [];

                connection.query(album_query,(err,result)=>{
                    id.push(result[0].album_id);
                    handleresult(id) 
                })
                function handleresult(id)  {
                    let album_url = `${process.env.DISCOGS_API_BASE_URL}${id}?key=${process.env.DISCOGS_API_KEY}&secret=${process.env.DISCOGS_API_SECRET}`;
                    axios(album_url).then( results =>{
                        img_url.push(results.data.thumb);
                        
                    })

                    topplaylist.push({
                        playlist_title: item.playlist_name, playlist_id: item.playlist_id ,playlist_like : item.vote
                        ,playlist_user: item.user_name , playlist_id: item.playlist_id , img_url : img_url
                    })
                }
            
        });
    
    });
    
    let api_most_collected = `${process.env.DISCOGS_API_SEARCH_URL}&key=${process.env.DISCOGS_API_KEY}&secret=${process.env.DISCOGS_API_SECRET}`
    axios.get(api_most_collected).then(results => {
        most_collected = results.data.results;
        // console.log(top_charts);
        most_collected.forEach((item) => {
            const [artistName, albumTitle] = item.title.split("-");
            chart_most_collected.push({
                album_id: item.id, artist_name: artistName.trim(), title: albumTitle.trim(), date: item.year, img_url: item.cover_image
            });
        });
    });
});

// POST Request for add button to add album to the database. 
app.post('/addBtn', (req, res) => {
    let selectedPlaylistId = req.body.playlist;
    let album_id = req.body.album_id;
    let search_query = `SELECT * FROM album_playlist WHERE album_id = ? AND playlist_id = ?`;
    connection.query(search_query,[album_id,selectedPlaylistId], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
                res.redirect('/error');
        } else {
            const album_playlist_query = `INSERT INTO album_playlist (album_id, playlist_id) 
            VALUES (?, ?)`;
            connection.query(album_playlist_query, [album_id,selectedPlaylistId], (err) => {
                if (err) throw err;
                res.redirect('/');
            });
        }
    });
});

// GET Request for the error page
app.get('/error', (req,res)=>{
    let sessionObj = req.session;
    let loggedIn = false;
    if (sessionObj.sess_valid) {
        loggedIn = true;
    }
    res.render('error', { loggedIn, activeTab: 'home' , errorMessage : "Cannot add album , album already exists"});
});

// POST Request to create a playlist
app.post('/createPlaylist', (req, res) => {
    let title = req.body.collection_name;
    let desc = req.body.collection_desc;
    let album_id = req.body.album_id;
    let sessionObj = req.session;
    let user_id = sessionObj.user_id;
    let privacy_val = req.body.privacy;
    let playlist_query = `INSERT INTO playlist (playlist_name, playlist_desc, user_id , privacy) 
        VALUES (?, ?, ? ,?)`;
    connection.query(playlist_query, [title,desc,user_id,privacy_val],(err, result) => {
        if (err) throw err;
        const playlist_id = result.insertId;
        const album_playlist_query = `INSERT INTO album_playlist (album_id, playlist_id) 
                VALUES ('${album_id}', '${playlist_id}')`;
        connection.query(album_playlist_query, (err) => {
            if (err) throw err;
            res.redirect('/');
        });
    });
});


// GET Requst to display signup page
app.get('/signup', (req, res) => {
    let sessionObj = req.session;
    let loggedIn = false;
    if (sessionObj.sess_valid) {
        loggedIn = true;
    }
    res.render('signup', { loggedIn, activeTab: 'home' });
});

//POST Request to insert data into database with encryption
app.post('/signup', (req, res) => {
    let sessionObj = req.session;
    let loggedIn = false;
    if (sessionObj.sess_valid) {
        loggedIn = true;
    }
    //console.log(req.body);
    let username = req.body.username;
    let email = req.body.email;
    let password = req.body.password;
    const encryptedPassword = encryptPassword(password);
    let sqlinsert = `INSERT INTO user(email, user_name,password)
                     VALUES (?,?,?)`;

    if (username === '' || email === '' || password === '') {
        res.render('signup', { errorMessage: 'Username, email, and password are required.',loggedIn, activeTab: 'home' });
    }else{
        connection.query(sqlinsert, [email,username,encryptedPassword],(err) => {
            if (err) throw err;
            res.redirect('/login');
        });
    }
});

//GET request to display login page
app.get('/login', (req, res) => {
    let sessionObj = req.session;
    let loggedIn = false;
    if (sessionObj.sess_valid) {
        loggedIn = true;
    }
    res.render('login', { loggedIn, activeTab: 'home' });
});

//POST Request to very credentials of login infromation
app.post('/login', (req, res) => {
    let sessionObj = req.session;
    let loggedIn = false;
    if (sessionObj.sess_valid) {
        loggedIn = true;
    }
    let email = req.body.email;
    let password = req.body.password;
    let loginQuery = `SELECT * FROM user WHERE email = ? `;
    if (email && password) {
        connection.query(loginQuery, [email],(err, results) => {
            if (err) throw err;
            if (results.length > 0) {
                const user = results[0];
                if (verifyPassword(password, user.password)) {
                let user_id = user.user_id; 
                let sessionObj = req.session;
                sessionObj.sess_valid = true;
                sessionObj.user_id = user_id; 
                // let loggedIn = sessionObj.sess_valid;
                res.redirect('/')
                }else{
                    res.render('login', { loggedIn, activeTab: 'home' ,errorMessage :'Invalid  or password '});
                }
                
            }
            else {
                res.render('login', { loggedIn, activeTab: 'home' ,errorMessage :' Username or password '});
            }

            res.end();
        });
    } else {
        res.render('login', { loggedIn, activeTab: 'home' ,errorMessage :'Invalid '});
        res.end()
    }

});

// GET Request to log out the user and end the session
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
          console.log(err);
        } else {
          res.redirect('/login');
        }
    });
});

// GET request to dispaly album page
app.get('/album?', (req, res) => {
    let id = req.query.id;
    let album_url = `${process.env.DISCOGS_API_BASE_URL}${id}?key=${process.env.DISCOGS_API_KEY}&secret=${process.env.DISCOGS_API_SECRET}`;
    let img_url = []
    let artist = []
    let label = []
    let format = [];
    let release = [];
    let genre = [];
    let track_list = [];
    let title = []
    let playlist_names = [];
    let sessionObj = req.session;
    let sess_user_id = sessionObj.user_id;
    let loggedIn = false;
    if (sessionObj.sess_valid) {
        loggedIn = true;
        let user_id = sessionObj.user_id;
        let playlistQuerySearch = `SELECT * FROM playlist WHERE user_id = ?`;
        connection.query(playlistQuerySearch, [user_id],(err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            isEmpty = false;
            results.forEach((item) => {
                playlist_names.push({
                    playlist_title: item.playlist_name, playlist_id: item.playlist_id
                })
            });

        } else {
            isEmpty = true;
        }
        });
    }
    let isEmpty = true;
    
    axios.get(album_url).then(results => {
        title = results.data.title
        img_url.push(results.data.images[0].uri)
        const artists = results.data.artists;
        artist = artists.map((artist) => artist.name);
        const labels = results.data.labels
        label = labels.map((label) => label.name)
        const uniqueLabels = [];
        // loop through each label name and check if it exists in uniqueLabels
        label.forEach((name) => {
            if (!uniqueLabels.includes(name)) {
                uniqueLabels.push(name);
            }
        });
        release.push(results.data.released)
        const formats = results.data.formats;
        format = formats.map((format) => format.name);
        const genres = results.data.genres;
        genre = genres.map((genre) => genre)

        track_list = results.data.tracklist.map(track => ({
            track_num: track.position,
            track_title: track.title,
            duration: track.duration
        }));
        res.render('album', { title, img_url, artist, uniqueLabels, format, release, genre, track_list, loggedIn, activeTab: 'explore' ,id, sess_user_id, vote, comments,isEmpty,playlist_names});
    });

    let vote;
    let like_query = " SELECT SUM(vote) as total_vote FROM rating WHERE album_id = ? "
    connection.query(like_query, [id], (err, results) => {
        vote = results[0].total_vote;
        console.log(vote);
    });
    let page = req.query.page || 1; // Default to page 1 if not specified
    let pageSize = 10; // Number of albums per page
    let offset = (page - 1) * pageSize;
    let comment_query = "SELECT c.`user_id`, c.`comment_desc`, c.`comment_date`, c.`album_id`, u.`user_name` FROM `comments` c INNER JOIN `user` u ON c.`user_id` = u.`user_id` WHERE c.`album_id` = ?"
    let commentCountQuery = 'SELECT COUNT(*) as count FROM comments WHERE album_id = ?';
    let comments = [];
    let commentCount ;
    connection.query(commentCountQuery, [id.toString()], (err, results) => {
        if(err) throw err;
         
        commentCount = results[0].count;
        connection.query(comment_query,[id ,pageSize , offset],(err , results) => {
            if(err) throw err;
            results.forEach((comment) => {
                comment.comment_date = moment(comment.comment_date).fromNow();
                comments.push(comment);
            });
        });
       
    });
   

});

//GET request to display Library page
app.get('/library', (req, res) => {
    let sessionObj = req.session;
    let user_id = sessionObj.user_id;
    let loggedIn = false;
    if (sessionObj.sess_valid) {
        loggedIn = true;
    }

    let query = `SELECT u.user_name, p.*, ap.album_id
                 FROM user u
                 JOIN playlist p ON u.user_id = p.user_id
                 JOIN album_playlist ap ON p.playlist_id = ap.playlist_id
                 WHERE u.user_id = ? `;

    let playlistObj = {};
    let promises = [];



    connection.query(query,[user_id], (err, results) => {
        if (err) throw err;

        results.forEach(row => {
            const playlistId = row.playlist_id;
            const albumIds = row.album_id;
            const user_name = row.user_name;
            const playlist_name = row.playlist_name;

            if (!playlistObj[playlistId]) {
                playlistObj[playlistId] = {
                    'playlist_id': playlistId,
                    'album_ids': [],
                    'user_name': user_name,
                    'playlist_name': playlist_name
                };
            }

            playlistObj[playlistId]['album_ids'].push(albumIds);
        });

        const playlists = Object.values(playlistObj);
        promises = playlists.map((item) => {
            const albumId = item.album_ids[0];
            let album_url = `${process.env.DISCOGS_API_BASE_URL}${albumId}?key=${process.env.DISCOGS_API_KEY}&secret=${process.env.DISCOGS_API_SECRET}`;
            return axios.get(album_url)
                .then(response => {
                    const coverUrl = response.data.images[0].uri;
                    item['coverUrl'] = coverUrl;
                })
                .catch(error => {
                    console.log(error);
                });
        });

        Promise.all(promises)
            .then(() => {
                console.log(playlists);
                res.render('library', { playlists, loggedIn, activeTab: 'library' });
            })
            .catch(error => {
                console.log(error);
                res.render('error');
            });
    }); 
});

//GET requst to disaply playlist page
app.get('/playlist?', (req, res) => {
    let sessionObj = req.session;
    let sess_user_id = sessionObj.user_id;
    let playlist_id = req.query.id;
    let page = req.query.page || 1; // Default to page 1 if not specified
    let pageSize = 10; // Number of albums per page
    let offset = (page - 1) * pageSize;
    let loggedIn = false;
    if (sessionObj.sess_valid) {
        loggedIn = true;
    }
    let query = "SELECT u.user_name, p.*, ap.album_id FROM user u JOIN playlist p ON u.user_id = p.user_id JOIN album_playlist ap ON p.playlist_id = ap.playlist_id WHERE p.playlist_id = ? LIMIT ? OFFSET ? ";
    let playlistInfo = [];
    let promises = [];
    let albumInfo = [];
    let isEmpty = true;
    let playlist_names = [];
    let playlistQuerySearch = "SELECT * FROM playlist WHERE user_id = ?";


    connection.query(playlistQuerySearch, [sess_user_id], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            isEmpty = false;
            // console.log(results)
            results.forEach((item) => {
                playlist_names.push({
                    playlist_title: item.playlist_name, playlist_id: item.playlist_id
                })
            });

        } else {
            isEmpty = true;
        }
    });

    let vote;
    let like_query = " SELECT SUM(vote) as total_vote FROM rating WHERE playlist_id = ?"
    connection.query(like_query, [playlist_id], (err, results) => {
        vote = results[0].total_vote;
        console.log(vote);
    });


    connection.query(query, [playlist_id, pageSize, offset], (err, results) => {
        if (err) throw err;

        console.log(results[0]);
        const user_name = results[0].user_name;
        const playlist_name = results[0].playlist_name;
        const playlist_desc = results[0].playlist_desc;
        const playlist_id = results[0].playlist_id;
        const privacy = results[0].privacy;
        const user_id = results[0].user_id
        let playlistObj = {
            'playlist_desc': playlist_desc,
            'user_name': user_name,
            'playlist_name': playlist_name,
            'playlist_id': playlist_id,
            'privacy': privacy,
            'user_id': user_id
        };
        playlistInfo.push(playlistObj);
       
        let promises = results.map(row => {
            const albumId = row.album_id;
            let album_url = `${process.env.DISCOGS_API_BASE_URL}${albumId}?key=${process.env.DISCOGS_API_KEY}&secret=${process.env.DISCOGS_API_SECRET}`;
            return new Promise((resolve, reject) => {
                axios.get(album_url).then(response => {
                    const coverUrl = response.data.images[0].uri;
                    const artists = response.data.artists;
                    let artist = [];
                    artist = artists.map((artist) => artist.name);
                    const album_title = response.data.title;

                    let albumObj = {
                        'coverUrl': coverUrl,
                        'artists': artist,
                        'album_title': album_title,
                        'album_id': albumId
                    };
                    albumInfo.push(albumObj);
                    resolve();
                }).catch(error => {
                    reject(error);
                });
            });
        });
        Promise.all(promises).then(() => {
            // console.log(sess_user_id)
            res.render('playlist', { 
                loggedIn, albumInfo, playlistInfo, isEmpty, playlist_names, activeTab: 'library', sess_user_id, vote, comments, page ,albumCount, pageSize ,commentCount,totalPages: Math.ceil(commentCount / pageSize )
            })
        }).catch(error => {
            console.error(error);
        })
        let albumCount = 0;
        connection.query(`SELECT COUNT(*) as count FROM album_playlist WHERE playlist_id = ${playlist_id}`, (err, results) => {
            if (err) throw err;
            albumCount = results[0].count;
        });
    });

    let comment_query = "SELECT c.`user_id`, c.`comment_desc`, c.`comment_date`, c.`playlist_id`, u.`user_name` FROM `comments` c INNER JOIN `user` u ON c.`user_id` = u.`user_id` WHERE c.`playlist_id` = ?"
    let commentCountQuery = "SELECT COUNT(*) as count FROM comments WHERE playlist_id = ?";
    let comments = [];
    let commentCount ;
    connection.query(commentCountQuery, [playlist_id], (err, results) => {
        if(err) throw err;
         
        commentCount = results[0].count;
        connection.query(comment_query,[playlist_id ,pageSize , offset],(err , results) => {
            if(err) throw err;
            results.forEach((comment) => {
                comment.comment_date = moment(comment.comment_date).fromNow();
                comments.push(comment);
            });
        });
       
    });
   
});

// POST Request to delete the album from the playlist in the database
app.post('/delete', (req, res) => {
    const playlist_id = req.body.playlist_id;
    const album_id = req.body.album_id;
    let delete_query = `DELETE FROM album_playlist WHERE playlist_id = ? and album_id = ?`
    let search_query = `SELECT * FROM album_playlist WHERE playlist_id = ?`
    let playlist_query = `DELETE FROM playlist WHERE playlist_id = ?`
    connection.query(search_query,[playlist_id],(err,results)=>{
        if(results.length === 1 ){
            connection.query(delete_query ,[playlist_id], (err)=>{
                if (err) throw err;
                connection.query(playlist_query,[playlist_id,album_id], (err) => {
                    if (err) throw err;
                    res.redirect('/library');
                })
            })
        }else{
            connection.query(delete_query, (err) => {
                if (err) throw err;
                res.redirect('/playlist?id=' + playlist_id);
            })
        }
    })
    
});

//POST request to edit the playlist details 
app.post('/playlist/edit/:id', function (req, res) {
    var playlist_id = req.params.id;
    var playlist_name = req.body.playlistName;
    var playlist_desc = req.body.playlistDesc;
    var privacy = req.body.privacy;

    // perform SQL query to update the playlist information
    var sql = "UPDATE playlist SET playlist_name = ?, playlist_desc = ? , privacy = ? WHERE playlist_id = ?";
    connection.query(sql, [playlist_name, playlist_desc, privacy, playlist_id], (err, result) => {
        if (err) throw err;
        console.log("Playlist information updated");
        res.redirect('/playlist?id=' + playlist_id);
    });
});

//POST Request to rate the playlist
app.post('/playlist_rate', (req, res) => {
    let playlist_id = req.body.playlist_id;
    let user_id = req.body.user_id;
    let action = req.body.action;

    console.log("rating...");
    if (action === 'like') {
        let select_query = "SELECT * FROM rating WHERE user_id = ? AND playlist_id = ?";
        connection.query(select_query, [user_id, playlist_id], (err, results) => {
            if (err) throw err;
            if (results.length > 0) {
                let delete_query = "DELETE FROM `rating` WHERE user_id = ? AND playlist_id = ?"
                connection.query(delete_query, [user_id, playlist_id], (err) => {
                    if (err) throw err;
                    console.log("unliked");
                });
            } else {
                let insert_query = "INSERT INTO rating( `user_id`, `vote`, `playlist_id`) VALUES (?,?,?)"
                connection.query(insert_query, [user_id, 1, playlist_id], (err) => {
                    if (err) throw err;
                    console.log("liked");
                });
            }
        });
    }
    res.redirect('/playlist?id=' + playlist_id);
});

//POST request to rate the album
app.post('/album_rate', (req, res) => {
    let album_id = req.body.album_id;
    let user_id = req.body.user_id;
    let action = req.body.action;

    console.log("rating...");
    if (action === 'like') {
        let select_query = "SELECT * FROM rating WHERE user_id = ? AND album_id = ?";
        connection.query(select_query, [user_id, album_id], (err, results) => {
            if (err) throw err;
            if (results.length > 0) {
                let delete_query = "DELETE FROM `rating` WHERE user_id = ? AND album_id = ?"
                connection.query(delete_query, [user_id, album_id], (err) => {
                    if (err) throw err;
                    console.log("unliked");
                });
            } else {
                let insert_query = "INSERT INTO rating( `user_id`, `vote`, `album_id`) VALUES (?,?,?)"
                connection.query(insert_query, [user_id, 1, album_id], (err) => {
                    if (err) throw err;
                    console.log("liked");
                });
            }
        });
    }
    res.redirect('/album?id=' + album_id);
});

//POST Request to comment on playlist
app.post('/playlist_comment', (req, res) => {
    let playlist_id = req.body.playlist_id;
    let user_id = req.body.user_id;
    let comment_desc = req.body.comment;
    let date = new Date();
    let timestamp = date.toISOString().slice(0, 19).replace('T', ' ') + ".000000";

    let insert_query = "INSERT INTO `comments`(`user_id`, `comment_desc`, `comment_date`, `playlist_id`) VALUES (?,?,?,?)"
    connection.query(insert_query, [user_id, comment_desc, timestamp, playlist_id], (err) => {
        if (err) throw err;
        console.log("commented");
    });
    res.redirect('/playlist?id=' + playlist_id);
});

//POST request to comment on the album
app.post('/album_comment', (req, res) => {
    let album_id = req.body.album_id;
    let user_id = req.body.user_id;
    let comment_desc = req.body.comment;
    let date = new Date();
    let timestamp = date.toISOString().slice(0, 19).replace('T', ' ') + ".000000";

    let insert_query = "INSERT INTO `comments`(`user_id`, `comment_desc`, `comment_date`, `album_id`) VALUES (?,?,?,?)"
    connection.query(insert_query, [user_id, comment_desc, timestamp, album_id], (err) => {
        if (err) throw err;
        console.log("commented");
    });
    res.redirect('/album?id=' + album_id);
});

//GET Request to seach an album
app.get('/search' , (req, res)=>{
    let sessionObj = req.session;
    let loggedIn = false;
    if (sessionObj.sess_valid) {
        loggedIn = true;
    }
    let search_text = req.query.searchtxt;
    convertedText = req.query.q || search_text.replace(/ /g, "+");
    const searchText = req.query.q || "";
    const genre_f = req.query.genre ? req.query.genre.split(',') : [""];
    let genreQuery = ""
    if(genre_f !== undefined || genre_f !== null) {
        genreQuery = `&genre=${genre_f}`;
    }
    const format_f = req.query.format ? req.query.format.split(',') : ["all"];
    let formatQuery = `&format=${format_f}`;
    const year_f = req.query.year ? req.query.year.split(',') : [""];
    let yearQuery =""
    if(year_f !== undefined || genre_f !== null ){
        yearQuery = `&year=${year_f}`;
    }
    

    let api_link = `${process.env.DB_API_SEARCH}q=${convertedText}&type=release&per_page=25&page=1&language_exact=English${formatQuery}${genreQuery}${yearQuery}&key=${process.env.DISCOGS_API_KEY}&secret=${process.env.DISCOGS_API_SECRET}`;
    console.log(api_link);
    axios.get(api_link)
    .then(response => {
        let searchObj = response.data.results;
        let search_results = [];
        let filter_list = {
            genre: [],
            format: [],
            year: []
        };
        let existingGenres = [];
        searchObj.forEach((item) => {
            const [artistName, albumTitle] = item.title.split("-");
            search_results.push({
                album_id: item.id, artist_name: artistName.trim(), title: albumTitle.trim(), img_url: item.cover_image
            });
            item.genre.forEach(genre => {
                if (!filter_list.genre.includes(genre)) {
                  filter_list.genre.push(genre);
                }
            });
            item.format.forEach(format => {
                if (!filter_list.format.includes(format)) {
                  filter_list.format.push(format);
                }
            });
            if (item.year && !filter_list.year.includes(item.year)) {
                filter_list.year.push(item.year);
            }
        });
        console.log(filter_list);
        res.render('search',{ loggedIn , activeTab: 'explore' , search_results, convertedText,  isEmpty, playlist_names ,filter_list} );
    })
    .catch(error => {
        console.log(error);
        res.render('search',{ loggedIn , activeTab: 'explore' , search_results, convertedText , isEmpty, playlist_names} );
    })

    let isEmpty = true;
    let playlist_names = [];
    let playlistQuerySearch = "SELECT * FROM playlist WHERE user_id = ?";
    let sess_user_id = sessionObj.user_id;

    connection.query(playlistQuerySearch, [sess_user_id], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            isEmpty = false;
            // console.log(results)
            results.forEach((item) => {
                playlist_names.push({
                    playlist_title: item.playlist_name, playlist_id: item.playlist_id
                })
            });
        } else {
            isEmpty = true;
        }
    });
});

//POST request to search the album based on filters
app.post('/search' ,(req,res)=>{
    let convertedText = req.body.searchtxt;
    console.log(convertedText);
    let genre_f = req.body.genre || []; //genre filter
    let genreQuery ='';
    if (genre_f !== null){
        genreQuery =`&genre=${genre_f}`;
    }
    let format_f = req.body.format || "all"; //format filter
    let year_f = req.body.year || []; //year filter
    let yearQuery = "";
    if(year_f !== null ){
        yearQuery = `&year=${year_f}`;
    }
    res.redirect(`/search?q=${convertedText}&format=${format_f}${genreQuery}${yearQuery}`);

});

//POST request delete playlist
app.post('/delete_playlist' , (req,res)=>{
    let playlist_id = req.body.playlist_id
    let album_playlist_query =` DELETE FROM album_playlist WHERE playlist_id = ? `
    let playlist_query =` DELETE FROM playlist WHERE playlist_id = ? `
    connection.query(album_playlist_query,[playlist_id],(err)=>{
    if(err) throw err;
    connection.query(playlist_query,[playlist_id],(err)=>{
        if(err) throw err;
        res.redirect('/library');
    })
 });
});

app.listen(PORT, () => {
    console.log(`server running on http://localhost:${PORT}`);
});