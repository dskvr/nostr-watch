<template>
  <span class="text-white lg:text-sm mr-2 ml-2 mt-1.5 text-xs">
    <span v-if="!store.tasks.isProcessing(`relays`)">Checked {{ sinceLast }} ago</span>
    <span v-if="store.tasks.isProcessing(`relays`)" class="italic lg:pr-9">
      <svg class="animate-spin mr-1 -mt-0.5 h-4 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      {{ this.store.tasks.getProcessed('relays').length }}/{{ this.relays.length }} Relays Checked
    </span>
  </span>
  <span class="text-white text-sm mr-2 mt-1.5" v-if="!store.tasks.isProcessing(`relays`)">-</span>
  <span class="text-white text-sm mr-2 mt-1.5" v-if="store.prefs.refresh && !store.tasks.isProcessing(`relays`)"> 
    Next check in: {{ untilNext  }}
  </span>
  <button 
    v-if="!store.tasks.isProcessing(`relays`)"
    class="mr-8 my-1 py-0 px-3 text-xs rounded border-b-3 border-slate-700 bg-slate-500  font-bold text-white hover:border-slate-500 hover:bg-slate-400" 
    :disabled='store.tasks.isProcessing(`relays`)' 
    @click="refreshNow()">
      Check{{ relay ? ` ${relay}` : "" }} Now
  </button>
</template>

<style scoped>

</style>

<script>
import { defineComponent, toRefs } from 'vue'

import { setupStore } from '@/store'
import RelaysLib from '@/shared/relays-lib.js'
// import History from '@/shared/history.js'
import SharedComputed from '@/shared/computed.js'

import { Inspector } from 'nostr-relay-inspector'
// import sizeof from 'object-sizeof'

import { relays } from '../../../../relays.yaml'
import { geo } from '../../../../cache/geo.yaml'

const localMethods = {

  migrateLegacy(){
    let hit = false 
    for(let i=0;i<relays.length;i++) {
      const cache = localStorage.getItem(`nostrwatch_${relays[i]}`)
      if(!cache) 
        continue
      hit = true 
      break;
    }
    if(hit){
      relays.forEach( relay => {
        const oldKey = `nostrwatch_${relay}`
        const oldCache = localStorage.getItem(oldKey)
        if(oldCache instanceof Object)
          this.setCache(oldCache)
        localStorage.removeItem(oldKey)
      })
    }
  },

  addToQueue: function(id, fn){
    this.store.tasks.addJob({
      id: id,
      handler: fn.bind(this)
    })
  },

  setRefreshInterval: function(){
    clearInterval(this.interval)
    this.interval = setInterval(() => {
      this.pageOpen += 1000
      if(!this.store.prefs.refresh )
        return 

      this.untilNext = this.timeUntilRefresh()
      this.sinceLast = this.timeSinceRefresh()

      if(!this.store.tasks.isProcessing)
        this.invalidate()
    }, 1000)
  },
  refreshNow(){
    this.invalidate(true)
  },
  handleVisibility(){
    if(document.visibilityState === 'hidden')
      this.windowActive = false 
    else 
      this.windowActive = true

    if(this.windowActive) 
      this.store.layout.setActiveTab(this.$tabId)
  },
  // handleRelaysFind(){
  //   this.addToQueue('relays/find', () => this.invalidate())  
  // },
  // handleRelaysSingle(relayURL){
  //   this.addToQueue('relays/single', () => this.invalidate(false, relayUrl))  
  // },
  invalidate: async function(force, single){
    //console.log('invalidate()', this.relays.length, force || this.isExpired )
    if( (!this.isExpired && !force) ) 
      return

    if(!this.windowActive)
      return

    this.store.tasks.startProcessing('relays')
    
    const relays = this.relays.filter( relay => !this.store.tasks.isProcessed('relays', relay) )

    //console.log('filtered relays', relays)

    // if(this.pageOpen > 4*60*1000)
    //   this.store.tasks.setRate('relays/find', 0)
    // else 
    //   this.store.tasks.setRate('relays/find', 2000)

    if(single) {
      //console.log('single relay', single)
      await this.check(single)
    } 
    else {
      //console.log('multiple relays',  single)
      // const processed = new Set()
      for(let index = 0; index < relays.length; index++) {
        const relay = relays[index]
        //console.log('checking relay', relay)
        this.check(relay)
          .then((result) => {
            //console.log('check completed', relay)
            if(this.store.tasks.isProcessed('relays', relay))
              return 
            
            //console.log('unique check', relay)
            
            this.store.tasks.addProcessed('relays', result.uri)

            this.results[result.uri] = result
            this.setCache(result)

            //console.log('cache set', result.uri, result)

            if(this.store.tasks.getProcessed('relays').length >= this.relays.length)
              this.completeAll()

            return this.results
          })
          .then( async () => {
            // this.history = await History()
          })
          .catch( err => console.error(err) )
      }
    } 
  },

  completeAll: function(){
    //console.log('completed')
    this.store.tasks.finishProcessing('relays')
    this.store.relays.updateNow()
    this.store.relays.setAggregateCache('public', Object.keys(this.results).filter( result => this.results[result].aggregate === 'public' ))
    this.store.relays.setAggregateCache('restricted', Object.keys(this.results).filter( result => this.results[result].aggregate === 'restricted' ))
    this.store.relays.setAggregateCache('offline', Object.keys(this.results).filter( result => this.results[result].aggregate === 'offline' ))
    //console.log('all are complete?', !this.store.tasks.isProcessing)
    this.setAverageLatency()
  },

  check: async function(relay){
    //console.log('this.averageLatency', this.averageLatency)
    await this.delay(this.averageLatency)
        
    return new Promise( (resolve, reject) => {
      const opts = {
          checkLatency: true,          
          getInfo: true,
          getIdentities: true,
          // debug: true,
          connectTimeout: this.getDynamicTimeout,
          readTimeout: this.getDynamicTimeout,
          writeTimeout: this.getDynamicTimeout,
        }
      
      if(this.store.user.testEvent)
        opts.testEvent = this.store.user.testEvent

      let socket = new Inspector(relay, opts)

      socket
        .on('complete', (instance) => {
          instance.result.aggregate = this.getAggregate(instance.result)
          instance.relay.close()
          instance.result.log = instance.log
          resolve(instance.result)
        })
        .on('close', () => {
          //console.log(`${relay.url} has closed`)
        })
        .on('error', () => {
          reject()
        })
        .run()
    })
  },
  
  setAverageLatency: function(){
    const latencies = new Array()
    this.relays.forEach( relay => {
      latencies.push(this.results[relay]?.latency?.final)
    })
    this.averageLatency =  this.average(latencies)
  },

  average(arr){
    let sum = 0,
        total = arr.length;
    for (let i = 0;i<total;i++) 
      sum += arr[i];
    return Math.floor(parseFloat(sum/total));
  },
  timeUntilRefresh(){
    return this.timeSince(Date.now()-(this.store.relays.lastUpdate+this.store.prefs.duration-Date.now())) 
  },
  timeSinceRefresh(){
    return this.timeSince(this.store.relays.getLastUpdate) || Date.now()
  },
}

export default defineComponent({
  name: 'RefreshComponent',
  components: {},
  setup(props){
    const {resultsProp: results} = toRefs(props)
    return { 
      store : setupStore(),
      results: results
    }
  },
  created(){
    clearInterval(this.interval)
    // document.addEventListener("visibilitychange", () => {
    //   if(document.visibilityState == 'visible')
    //     this.store.layout.setActiveTab(this.$tabid)
    //   // if 
      
    //   //   document.title = document.hidden ? "I'm away" : "I'm here";
    // });
    document.body.onfocus = () => {
      // alert('tab focused')
      //console.log(`tab #${this.$tabId} is active`)
      
    }
    document.addEventListener('visibilitychange', this.handleVisibility, false)
  },
  unmounted(){
    clearInterval(this.interval)
    // document.removeEventListener("visibilitychange", this.handleVisibility, false);
  },
  beforeMount(){
    this.untilNext = this.timeUntilRefresh()
    this.sinceLast = this.timeSinceRefresh()

    this.store.relays.setRelays(relays)
    this.store.relays.setGeo(geo)

    this.relays = relays
    this.lastUpdate = this.store.relays.lastUpdate

    //console.log('total relays', this.relays, this.relays.length)
    for(let ri=0;ri-this.relays.length;ri++){
      const relay = this.relays[ri],
            cache = this.getCache(relay)
      this.results[relay] = cache
      // //console.log('result', 'from result', this.results[relay], 'from cache', cache) 
    }
  },
  mounted(){
    this.migrateLegacy()
    if(this.store.tasks.isProcessing(`relays`))
      this.invalidate(true)
    else
      this.invalidate()

    this.setRefreshInterval()
  },
  updated(){},
  computed: Object.assign(SharedComputed, {
    getDynamicTimeout: function(){
      return this.averageLatency*this.relays.length
    },
  }),
  methods: Object.assign(localMethods, RelaysLib),
  props: {
    resultsProp: {
      type: Object,
      default(){
        return {}
      }
    },
  },
  data() {
    return {
      relay: "",
      relays: [],
      refresh: {},
      untilNext: null,
      lastUpdate: null,
      sinceLast: null,
      interval: null,
      windowActive: true,
      averageLatency: 200,
      pageOpen: 0,
      // history: null
    }
  },
})
</script>

<style scoped>
 #refresh { font-size: 12pt; color:#666; margin-bottom:15px }
 #refresh button { cursor: pointer; border-radius: 3px; border: 1px solid #a0a0a0; color:#333 }
 #refresh button:hover {color:#000;}
 #refresh button[disabled] {color:#999 !important; border-color:#e0e0e0}
</style>
