/* Service worker della Gabbia — gira in background, anche ad app chiusa.
   Il suo unico compito: ricevere l'avviso e mostrarlo come notifica di sistema. */
self.addEventListener("install", function(e){ self.skipWaiting(); });
self.addEventListener("activate", function(e){ e.waitUntil(self.clients.claim()); });

self.addEventListener("push", function(event){
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch(e) {}
  var title = data.title || "La Gabbia dei Matti";
  var options = {
    body: data.body || "",
    icon: data.icon || undefined,
    badge: data.badge || undefined,
    tag: data.tag || undefined,
    data: { url: data.url || "/" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/* toccando la notifica si va all'app: se è già aperta la porta in primo piano,
   altrimenti ne apre una nuova */
self.addEventListener("notificationclick", function(event){
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({type:"window", includeUncontrolled:true}).then(function(list){
      for (var i=0;i<list.length;i++){
        if ("focus" in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
