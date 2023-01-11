import { defineStore } from 'pinia'
// import { relays } from '../../relays.yaml'
// import { geo } from '../../relays.yaml'

export const useRelaysStore = defineStore('relays', {
  state: () => ({ 
    urls: new Array(),
    // results: new Object(),
    geo: new Object(),
    lastUpdate: null,
    count: new Object(),
    processing: false,
    processedRelays: new Set(),
    favorites: new Array(),
    aggregates: {},
    aggregatesAreSet: false,
    cached: new Object(),
    canonicals: new Object(),
    nip23: new Object(),
    nip23Synced: new Object(),
  }),
  getters: {
    getAll: (state) => state.urls,
    getRelays: (state) => (aggregate, results) => {
      if( 'all' == aggregate )
        return state.urls.map(x=>x)
      if( 'favorite' == aggregate )
        return state.favorites
      return state.urls.filter( (relay) => results?.[relay]?.aggregate == aggregate)
    },
    getByAggregate: state => aggregate => {
      return state.urls
              .filter( (relay) => state.results?.[relay]?.aggregate == aggregate)
    },

    // getResults: (state) => state.results,
    // getResult: (state) => (relayUrl) => state.results?.[relayUrl],
    
    getGeo: state => relayUrl => state.geo[relayUrl],

    getLastUpdate: state => state.lastUpdate,

    getCount: state => type => state.count[type],
    getCounts: state => state.count,

    getAggregate: state => which => state.aggregates[which],
    areAggregatesSet: state => state.aggregatesAreSet,

    getFavorites: state => state.favorites,
    isFavorite: state => relayUrl => state.favorites.includes(relayUrl),

    getAggregateCache: state => aggregate => state.cached[aggregate] instanceof Array ? state.cached[aggregate] : [],

    getCanonicals: state => state.canonicals,
    getCanonical: state => relay => state.canonicals[relay],

    getNip23: state => state.nip23
  },
  actions: {
    addRelay(relayUrl){ 
      this.urls.push(relayUrl)
    },

    addRelays(relayUrls){ 
      this.urls = Array.from(new Set(this.urls.concat(this.urls, relayUrls))) 
    },

    setRelays(relayUrls){ 
      this.urls = relayUrls 
    },

    setGeo(geo){ 
      this.geo = geo 
    },

    setStat(type, value){ 
      this.count[type] = value 
    },

    setAggregate(aggregate, arr){ 
      this.aggregates[aggregate] = arr 
    },

    setAggregates(obj){ 
      this.aggregatesAreSet = true
      this.aggregates = obj 
    },
  
    setFavorite(relayUrl){ 
      this.favorites.push(relayUrl)
      this.favorites = this.favorites.map( x => x )
      if(typeof this.nip23[relayUrl] === 'undefined')
        this.setNip23({ [relayUrl]: { read: true, write: true } })
    },

    unsetFavorite(relayUrl){ 
      this.favorites = this.favorites.filter(item => item !== relayUrl)
      if(typeof this.nip23[relayUrl] !== 'undefined')
        delete this.store.relays.nip23[relayUrl]
    },

    toggleFavorite(relayUrl){
      ////console.log('toggle favorite', relayUrl)
      if( this.isFavorite(relayUrl) )
        this.unsetFavorite(relayUrl)
      else 
        this.setFavorite(relayUrl)
      return this.isFavorite(relayUrl)
    },

    setAggregateCache(aggregate, array){
      if( !(this.cached[aggregate] instanceof Array) )
        this.cached[aggregate] = new Array()
      this.cached[aggregate] = array
    },

    setCanonicals(c){
      this.canonicals = c
    },

    setNip23(obj){
      this.nip23 = Object.assign(obj, this.nip23)
    },

    setNip23Status(obj) {
      this.nip23Synced = obj
    },
  },
})