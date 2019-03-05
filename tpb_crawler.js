'strict'
process.chdir('/root/new-0/');
var request = require('request')
var cheerio = require('cheerio')
var colors = require('colors')
var fs = require('fs')
var parseTorrent = require('parse-torrent')
var existing_in_kayanbu
var fetched_hashes
const del = require('del');
var simpleGit = require('simple-git')


var hrefs = []
var contents = [{ type: 'index', url: "https://thepiratebay.org/recent" }]
var fetched_contents = []

var mkdir = function(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }
}

var push_to_github = function() {
      simpleGit('.')
        //.addConfig('user.name', 'Robin')
        //.addConfig('user.email', 'therobinhood@users.noreply.github.com')
        .outputHandler(function(command, stdout, stderr) {
          stdout.pipe(process.stdout);
          stderr.pipe(process.stderr);
        })
        .add('./*')
        .commit('Automatic TPB crawler update')
        .push('origin', 'master').then(function() {
          console.log('pushed tpb crawling updates successfully.')
        })
}

var separate_by = function(words, symbol) {
  var final_words = []
  words.forEach(function(each_word) {
    each_word.split(symbol).forEach(function(each_single_word) {
      final_words.push(each_single_word)
    })
  })
  return final_words
}
var folder = -1
var stepsize = 1000;
var transliterator = require('transliterator');
var current_count = -1
var all_categories = {}

fs.writeFileSync("./categories.json", JSON.stringify(all_categories))

// console.log('creating folders and moving to ./output/' + folder)

mkdir('./categories')
mkdir('./search')
mkdir('./metadata')
mkdir('./pages')

Object.keys(all_categories).forEach(function(each_category) {
  Object.keys(all_categories[each_category]).forEach(function(each_subcategory) {
    all_categories[each_category][each_subcategory] = 0
  })
})

var create_metadata = function(each_row, step) {
  console.log('<create_metadata>', each_row, step)

  if (step % 50000 === 0) {
    console.log(colors.red('It\'s time to start creating a new repo...'))
  }
  console.log('saving categories.json', all_categories)

  var words = each_row.title.split(' ')
  var clean = ['{', '}', '+', '_', '*', '-', '.', '/', '(', ')', '[', ']', '\'', ',', '&', '~', '!', '@', ':', ';', '%', '?', '¿', '!', '¡', '$', '%', '^', '\\', '|', '<', '>', '`']
  clean.forEach(function(remove_symbol) {
      words = separate_by(words, remove_symbol)
    })
    // console.log(words)
  var torrent = parseTorrent(each_row.magnet)

  words.forEach(function(each_word) {
    each_word = transliterator(each_word.toLowerCase())

    if (['the', 'and', 'of', 'in', 'by', 'to'].indexOf(each_word) == -1) {
      if (each_word.length > 1 && each_word.length < 100) {
        var existing_hashes_for_word
        try {
          existing_hashes_for_word = require('./search/' + each_word + '.json')
        } catch (e) {
          existing_hashes_for_word = []
        }
        if (existing_hashes_for_word.indexOf(torrent.infoHash) == -1) {
          existing_hashes_for_word.push(torrent.infoHash)
        }
        fs.writeFileSync("./search/" + each_word + '.json', JSON.stringify(existing_hashes_for_word))
      }
    }
  })

  if (each_row.categoryP != undefined && each_row.categoryS != undefined) {
    each_row.categoryP = each_row.categoryP.toLowerCase().replace(/ /g, '_').replace('\/', '_').replace(/-/g, '_')
    each_row.categoryS = each_row.categoryS.toLowerCase().replace(/ /g, '_').replace('\/', '_').replace(/-/g, '_')

    if (all_categories[each_row.categoryP] == undefined) {
      all_categories[each_row.categoryP] = {}
    }
    if (all_categories[each_row.categoryP][each_row.categoryS] == undefined) {
      all_categories[each_row.categoryP][each_row.categoryS] = 0
    }

    all_categories[each_row.categoryP][each_row.categoryS] = all_categories[each_row.categoryP][each_row.categoryS] + 1

    var cpage = parseInt(all_categories[each_row.categoryP][each_row.categoryS] / 500)
    var existing_hashes_for_categ
    try {
      existing_hashes_for_categ = require('./categories/' + each_row.categoryP + ':' + each_row.categoryS + ':' + cpage + '.json')
    } catch (e) {
      existing_hashes_for_categ = []
    }
    if (existing_hashes_for_categ.indexOf(torrent.infoHash) == -1) {
      existing_hashes_for_categ.push(torrent.infoHash)
    }
    fs.writeFileSync('./categories/' + each_row.categoryP + ':' + each_row.categoryS + ':' + cpage + '.json', JSON.stringify(existing_hashes_for_categ))
  }

  each_row.parsed = torrent
  if (existing_in_kayanbu.indexOf(each_row.parsed.infoHash) > -1) {
    got_repeated = true
  }
  if (fetched_hashes.indexOf(each_row.parsed.infoHash) > -1) {
    console.log(colors.red('ALREADY HAD IT!', each_row.parsed.infoHash))
  } else {
    fs.writeFileSync("./metadata/" + each_row.parsed.infoHash + '.json', JSON.stringify(each_row))
    console.log(colors.green.underline('SAVED IT!', each_row.parsed.infoHash))
  }

}

var count = 0
var process_html = function(body, type, url, callback) {
  console.log('processing:', type)
  var $ = cheerio.load(body);
  var links = $('a')
  var categs
  var uploader
  var sizebytes = 0

  console.log('PAGE!')
  if (type == 'torrent') {
    var info = $('.nfo > pre')
    var seeders = $('#details > dl.col2 > dd:nth-child(6)').html()
    var leechers = $('#details > dl.col2 > dd:nth-child(8)').html()
    var size = $('#details > dl.col1 > dd:nth-child(6)').html()
    console.log('size', size)
    try {
      sizebytes = size.split('(')[1].replace('&#xA0;Bytes)', '')
    } catch (e) {}
    console.log('SIZE', size)

    Object.keys(links).forEach(function(index) {
      try {
        var href = links[index].attribs.href
          // console.log('TITLE:', $('#title').text().replace(/\\n +/g,''))

        if (href.indexOf('magnet:') == 0) {
          // console.log('MAGNET:', href)
          magnet = href
        }
        if (href.indexOf('/user/') == 0) {
          // console.log('USER:', href, links[index].attribs.title, links[index])
          uploader = links[index].attribs.title
        }

        if (href.indexOf('/browse/') == 0) {
          // console.log('CATEGORY:', href)
          categs = links[index].children[0].data.split(' > ')
        }
      } catch (e) {}

    })
    try {
      create_metadata({
        title: $('#title').text().replace(/[\n] +/g, ''),
        magnet: magnet,
        uploader: uploader.replace('Browse ', ''),
        categoryP: categs[0],
        categoryS: categs[1],
        size: sizebytes,
        seeders: seeders,
        leechers: leechers,
        description: info.html(),
        last_updated: new Date()
      }, count)
      count++
    } catch (e) {}
  } else {
    Object.keys(links).forEach(function(index) {
      try {
        var href = links[index].attribs.href
        if (href.indexOf('/torrent/') == 0) {
          console.log(href)
          hrefs.push(href)
          contents.push({ type: 'torrent', url: 'https://thepiratebay.org' + href })
        }
      } catch (e) {}
    })
  }


  console.log(hrefs.length)

  // console.log('going to write:', $.html())
  var html_content = $.html()
  fs.writeFileSync('./pages/' + url.replace(/\//g, '_'), html_content)

  if (callback) callback()

}
var got_repeated = false
var tbppage = 0
var fetchContent = function() {
  if (got_repeated == false && contents.length == 0 && tbppage < 35) {
    contents.push({ type: 'index', url: 'https://thepiratebay.org/recent/' + tbppage })
    tbppage++
    if (tbppage == 34) {
      console.log(colors.green('Finished updating with TPB!'), got_repeated, contents.length, tbppage)
      push_to_github()
    }
  } else {

  }
  if(tbppage < 34){
  console.log(colors.green('Status:'), got_repeated, contents.length, tbppage)

  var each_content = contents.pop()
  var each_content_fixed = each_content.url.replace(/\//g, '_')


  if (fetched_contents != undefined && fetched_contents.indexOf(each_content_fixed) > -1) {
    console.log(colors.blue('reading file from folder:', each_content_fixed))
    fs.readFile('./pages/' + each_content_fixed, function(err, body) {

      process_html(body.toString(), each_content.type, each_content.url, function() {
        fetchContent()
      })

    })
  } else
  if (each_content.url != undefined) {
    console.log('getting ', each_content.url)
    console.log(colors.magenta('reading file from web:', each_content_fixed))
    console.log(each_content.url)
    request
      .get(each_content.url, function optionalCallback(err, httpResponse, body) {
        console.log('err', err)
        console.log('httpResponse', httpResponse)
        console.log('body', body)
        process_html(body.toString(), each_content.type, each_content.url, function() {
          fetchContent()
        })
      })
  }
  }
}

// push_to_github()
if(true){
var erase = 'https://thepiratebay.org/recent'
erase = erase.replace(/\//g, '_')
fs.readFile('./existing.json', function(err, data) {
  existing_in_kayanbu = JSON.parse(data.toString())
  del(['pages/' + erase, 'pages/' + erase + '*']).then(paths => {
    // console.log('Deleted files and folders:\n', paths.join('\n'));
    fs.readdir('./pages', function(err, filenames) {
      fs.readdir('./metadata', function(err, hashes) {
        fetched_hashes = hashes.map(each => each.replace('.json', ''))
        // console.log(colors.green(fetched_hashes.length, 'fetched_hashes', fetched_hashes))
        fetched_contents = filenames
        fetchContent()
      })
    })
  });
})
}
