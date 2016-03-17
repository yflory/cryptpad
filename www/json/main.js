require(['ChainJSON.js',
        'jquery.min.js'], function(API) {
  var $ = window.$;
  API.register({}).then(function(p) {
    
    $('#send').click(function() {
      var prop = $('#prop').val();
      var value = $('#value').val();
      if(prop.trim() && value.trim()) {
        p[prop] = value;
      }
    });
    
    $('#getvalue').click(function(){
      console.log(p);
      alert(JSON.stringify(p));
      
    });
    
  });;
  
  
  
  
  
  
  
});