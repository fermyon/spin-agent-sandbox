//! Denied `wasi:sockets`: creating a socket or resolving a name returns `access-denied`.
//! componentize-py forces these imports on the Python guest; the sandbox grants no raw
//! network access (outbound HTTP goes through src/outgoing.rs). Resource methods are
//! unreachable for the same reason as in src/capabilities.rs.

use crate::bindings::exports::wasi::sockets::{
    instance_network, ip_name_lookup, network, tcp, tcp_create_socket, udp, udp_create_socket,
};
use crate::capabilities::NO_HANDLE;
use crate::Component;

use network::{ErrorCode, IpAddressFamily, IpSocketAddress, NetworkBorrow};

/// `instance-network` cannot fail, so it hands out this method-less token; every
/// function that takes one is denied.
pub struct Network;

impl network::GuestNetwork for Network {}

impl network::Guest for Component {
    type Network = Network;
}

impl instance_network::Guest for Component {
    fn instance_network() -> network::Network {
        network::Network::new(Network)
    }
}

impl tcp_create_socket::Guest for Component {
    fn create_tcp_socket(_address_family: IpAddressFamily) -> Result<tcp::TcpSocket, ErrorCode> {
        Err(ErrorCode::AccessDenied)
    }
}

impl udp_create_socket::Guest for Component {
    fn create_udp_socket(_address_family: IpAddressFamily) -> Result<udp::UdpSocket, ErrorCode> {
        Err(ErrorCode::AccessDenied)
    }
}

impl ip_name_lookup::Guest for Component {
    type ResolveAddressStream = ResolveAddressStream;

    fn resolve_addresses(
        _network: NetworkBorrow<'_>,
        _name: String,
    ) -> Result<ip_name_lookup::ResolveAddressStream, ErrorCode> {
        Err(ErrorCode::AccessDenied)
    }
}

pub struct ResolveAddressStream;

impl ip_name_lookup::GuestResolveAddressStream for ResolveAddressStream {
    fn resolve_next_address(&self) -> Result<Option<ip_name_lookup::IpAddress>, ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn subscribe(&self) -> ip_name_lookup::Pollable {
        unreachable!("{NO_HANDLE}")
    }
}

impl tcp::Guest for Component {
    type TcpSocket = TcpSocket;
}

pub struct TcpSocket;

impl tcp::GuestTcpSocket for TcpSocket {
    fn start_bind(&self, _network: NetworkBorrow<'_>, _local_address: IpSocketAddress) -> Result<(), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn finish_bind(&self) -> Result<(), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn start_connect(&self, _network: NetworkBorrow<'_>, _remote_address: IpSocketAddress) -> Result<(), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn finish_connect(&self) -> Result<(tcp::InputStream, tcp::OutputStream), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn start_listen(&self) -> Result<(), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn finish_listen(&self) -> Result<(), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn accept(&self) -> Result<(tcp::TcpSocket, tcp::InputStream, tcp::OutputStream), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn local_address(&self) -> Result<IpSocketAddress, ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn remote_address(&self) -> Result<IpSocketAddress, ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn is_listening(&self) -> bool {
        unreachable!("{NO_HANDLE}")
    }
    fn address_family(&self) -> IpAddressFamily {
        unreachable!("{NO_HANDLE}")
    }
    fn set_listen_backlog_size(&self, _value: u64) -> Result<(), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn keep_alive_enabled(&self) -> Result<bool, ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn set_keep_alive_enabled(&self, _value: bool) -> Result<(), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn keep_alive_idle_time(&self) -> Result<tcp::Duration, ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn set_keep_alive_idle_time(&self, _value: tcp::Duration) -> Result<(), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn keep_alive_interval(&self) -> Result<tcp::Duration, ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn set_keep_alive_interval(&self, _value: tcp::Duration) -> Result<(), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn keep_alive_count(&self) -> Result<u32, ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn set_keep_alive_count(&self, _value: u32) -> Result<(), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn hop_limit(&self) -> Result<u8, ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn set_hop_limit(&self, _value: u8) -> Result<(), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn receive_buffer_size(&self) -> Result<u64, ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn set_receive_buffer_size(&self, _value: u64) -> Result<(), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn send_buffer_size(&self) -> Result<u64, ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn set_send_buffer_size(&self, _value: u64) -> Result<(), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn subscribe(&self) -> tcp::Pollable {
        unreachable!("{NO_HANDLE}")
    }
    fn shutdown(&self, _shutdown_type: tcp::ShutdownType) -> Result<(), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
}

impl udp::Guest for Component {
    type UdpSocket = UdpSocket;
    type IncomingDatagramStream = IncomingDatagramStream;
    type OutgoingDatagramStream = OutgoingDatagramStream;
}

pub struct UdpSocket;

impl udp::GuestUdpSocket for UdpSocket {
    fn start_bind(&self, _network: NetworkBorrow<'_>, _local_address: IpSocketAddress) -> Result<(), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn finish_bind(&self) -> Result<(), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn stream(
        &self,
        _remote_address: Option<IpSocketAddress>,
    ) -> Result<(udp::IncomingDatagramStream, udp::OutgoingDatagramStream), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn local_address(&self) -> Result<IpSocketAddress, ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn remote_address(&self) -> Result<IpSocketAddress, ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn address_family(&self) -> IpAddressFamily {
        unreachable!("{NO_HANDLE}")
    }
    fn unicast_hop_limit(&self) -> Result<u8, ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn set_unicast_hop_limit(&self, _value: u8) -> Result<(), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn receive_buffer_size(&self) -> Result<u64, ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn set_receive_buffer_size(&self, _value: u64) -> Result<(), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn send_buffer_size(&self) -> Result<u64, ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn set_send_buffer_size(&self, _value: u64) -> Result<(), ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn subscribe(&self) -> udp::Pollable {
        unreachable!("{NO_HANDLE}")
    }
}

pub struct IncomingDatagramStream;

impl udp::GuestIncomingDatagramStream for IncomingDatagramStream {
    fn receive(&self, _max_results: u64) -> Result<Vec<udp::IncomingDatagram>, ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn subscribe(&self) -> udp::Pollable {
        unreachable!("{NO_HANDLE}")
    }
}

pub struct OutgoingDatagramStream;

impl udp::GuestOutgoingDatagramStream for OutgoingDatagramStream {
    fn check_send(&self) -> Result<u64, ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn send(&self, _datagrams: Vec<udp::OutgoingDatagram>) -> Result<u64, ErrorCode> {
        unreachable!("{NO_HANDLE}")
    }
    fn subscribe(&self) -> udp::Pollable {
        unreachable!("{NO_HANDLE}")
    }
}
